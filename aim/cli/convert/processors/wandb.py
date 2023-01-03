from pathlib import Path
import re
import os.path
import json 
from tempfile import TemporaryDirectory
from pathlib import Path

import click
from tqdm import tqdm

from aim import Run, Distribution, Text, Figure
from aim.ext.resource.log import LogLine
from aim.ext.resource.configs import AIM_RESOURCE_METRIC_PREFIX


def upload_artifact(run, source):
    import requests
    files = {'file': open(source,'rb')}
    auth_info = None
    if os.getenv('AIM_ACCESS_TOKEN'):
        auth_info = 'Bearer {}'.format(os.getenv('AIM_ACCESS_TOKEN'))
    elif os.getenv('AIM_ACCESS_USERNAME') and os.getenv('AIM_ACCESS_PASSWORD'):
        from base64 import b64encode
        auth_info = 'Basic {}'.format(
                b64encode('{}:{}'.format(os.getenv('AIM_ACCESS_USERNAME'), os.getenv('AIM_ACCESS_PASSWORD')).encode('utf-8')
                ).decode('utf-8'))
    elif os.getenv('AIM_ACCESS_CREDENTIAL'):
        auth_info = os.getenv('AIM_ACCESS_CREDENTIAL')
    
    endpoint = 'http://localhost:1024' if run.repo.root_path.startswith('/') else f'https://{run.repo.root_path.replace.split(":")[0]}'
    r = requests.post(f'{endpoint}/artifacts/upload/{run.experiment}/{run.hash}', files=files, headers={'Authorization': auth_info})
    return r.json()['path']
    

def parse_wandb_logs(repo_inst, entity, project, run_id):
    import wandb
    from wandb_gql import gql
    from datauri import DataURI

    client = wandb.Api()

    if run_id is None:
        # process all runs
        runs = client.runs(entity + "/" + project)
    else:
        try:
            # get the run by run_id
            run = client.run(f"{entity}/{project}/{run_id}")
        except Exception:
            click.echo(f"Could not find run '{entity}/{project}/{run_id}'", err=True)
            raise
        runs = (run,)

    for run in tqdm(runs, desc="Converting wandb logs"):
        aim_run = Run(
            repo=repo_inst,
            system_tracking_interval=None,
            capture_terminal_logs=False,
            experiment=project
        )
        aim_run['wandb_run_id'] = run.id
        aim_run['wandb_run_name'] = run.name
        aim_run.description = run.notes

        # Convert Rich Artifacts (Table & Molecule & Plotly & Histogram)
        with TemporaryDirectory() as tmpdirname:
            for step_record in tqdm(run.history(pandas=False), desc='convert rich steps'):
                step = step_record['_step']
                for k, v in step_record.items():
                    if not isinstance(v, (list, dict)):
                        continue
                    rs = v if isinstance(v, list) else [v]
                    for r in rs:
                        if r['_type'] == 'histogram': 
                            if 'packedBins' in r:
                                bin_count = r['packedBins']['count']
                                bin_min = r['packedBins']['min']
                                bin_max = r['packedBins']['min'] + r['packedBins']['size'] * bin_count
                            else:
                                bin_count = len(r['bins'])
                                bin_min, bin_max = (r['bins'][0], r['bins'][-1])
                            d = Distribution(hist=r['values'], bin_count=bin_count, bin_range=(bin_min, bin_max))                                                                                          
                            aim_run.track(d, name=k, step=step)
                        elif r['_type'] == 'plotly-file' or 'plotly.json' in r['path']:
                            path = r['path']
                            run.file(path).download(root=tmpdirname) 
                            from plotly.io import read_json                 
                            figure = read_json(Path(tmpdirname) / path)
                            aim_run.track(Figure(figure), name=k, step=step)   
                        elif r['_type'] == 'table-file':
                            seq_id = v['_latest_artifact_path'].split('/', maxsplit=3)[2].split(':')[0]
                            table_file_name = v['_latest_artifact_path'].split('/')[-1]
                            query = """
                            query ResolveLatestSequenceAliasToArtifactId($sequenceId: ID!) {
                            artifactSequence(id: $sequenceId) {
                                latestArtifact {
                                id
                                __typename
                                }
                                __typename
                            }
                            }
                            """
                            artifacts = {i.id: i for i in run.logged_artifacts()}
                            r = run.client.execute(gql(query), {'sequenceId': seq_id})
                            artifact_id = r['artifactSequence']['latestArtifact']['id']
                            artifact = artifacts[artifact_id]
                            prefix = os.path.join(tmpdirname, artifact.name)
                            artifact.download(prefix)
                            table_file = os.path.join(prefix, table_file_name)
                            with open(table_file) as f:
                                table = json.load(f)
                            for row in table['data']:
                                for index, ele in enumerate(row):
                                    if not isinstance(ele, dict):
                                        continue
                                    if ele.get('_type') == 'image-file':
                                        embeded_image_file = os.path.join(prefix, ele['path'])
                                        ele['path'] = upload_artifact(aim_run, embeded_image_file)
                                    elif ele.get('_type') == 'molecule-file':
                                        embeded_molecule_file = os.path.join(prefix, ele['path'])
                                        ele['path'] = upload_artifact(aim_run, embeded_molecule_file)
                            table_content = json.dumps(table)
                            aim_run.track(Text(f'data:text/table,{table_content}'), name=k, step=step)  
                        elif r['_type'] == 'molecule-file':
                            path = r['path']
                            run.file(path).download(root=tmpdirname)
                            artifact_path = upload_artifact(aim_run, Path(tmpdirname) / path)
                            aim_run.track(Text(f'data:text/molecule-file-url,{artifact_path}'), name=k, step=step)  
        
        with TemporaryDirectory() as tmpdirname:
            # Collect console output logs
            console_log_filename = 'output.log'
            console_log_file = run.file(console_log_filename)
            try:
                # Even though the file does not exist, a file object will be returned in zero-sized.
                if console_log_file.size:
                    console_log_file.download(root=tmpdirname)
                    with open(Path(tmpdirname) / console_log_filename) as f:
                        [aim_run.track(LogLine(line), name='logs', step=i) for i, line in enumerate(f.readlines())]
            except Exception:
                click.echo("Failed to track console output log.", err=True)

            # TODO: Collect media files, possibly?

        # Collect params & tags
        aim_run['params'] = run.config
        for tag in run.tags:
            aim_run.add_tag(tag)

        from pprint import pprint
        keys = [key for key in run.history(stream='default').keys() if not key.startswith('_')]

        # Collect metrics
        for record in run.scan_history():
            step = record.get('_step')
            epoch = record.get('epoch')
            timestamp = record.get('_timestamp')
            for key in keys:
                value = record.get(key)
                if value is None:
                    continue
                try:
                    tag, name = key.rsplit("/", 1)
                    if "train" in tag:
                        context = {'tag': tag, 'subset': 'train'}
                    elif "val" in tag:
                        context = {'tag': tag, 'subset': 'val'}
                    elif "test" in tag:
                        context = {'tag': tag, 'subset': 'test'}
                    else:
                        context = {'tag': tag}
                except ValueError:
                    name, context = key, {}
                try:
                    if timestamp:
                        aim_run._tracker._track(value, track_time=timestamp, name=name,
                                                step=step, epoch=epoch, context=context)
                    else:
                        aim_run.track(value, name=name, step=step, epoch=epoch, context=context)
                except ValueError:
                    pass
                    #click.echo(f"Type '{type(value).__name__}': artifacts are not supported yet.", err=True)

        # Collect system logs
        # NOTE: In 'system' logs, collecting sampled history cannot be avoided. (default 'samples' == 500)
        # TODO: async history fetching for better performance
        for record in run.history(stream='system', pandas=False, samples=1e3):
            timestamp = record.get('_timestamp')
            for key in record:
                if key.startswith('_'):  # Including '_runtime', '_timestamp', '_wandb'
                    continue

                value = record.get(key)
                if value is None:
                    continue

                name, context = _normalize_system_metric_key(key)
                if name is None:
                    continue

                try:
                    if timestamp:
                        aim_run._tracker._track(value, track_time=timestamp,
                                                name=f'{AIM_RESOURCE_METRIC_PREFIX}{name}', context=context)
                    else:
                        aim_run.track(value, name=f'{AIM_RESOURCE_METRIC_PREFIX}{name}', context=context)
                except ValueError:
                    pass
                    #click.echo(f"Type '{type(value).__name__}': artifacts are not supported yet.", err=True)


def _normalize_system_metric_key(key):
    # Remap names for being categorized as `System` in aim ui: `aim/web/ui/src/config/systemMetrics/systemMetrics.ts``
    # {value is None} means not supported yet
    SYSTEM_METRICS_NAME_MAP = {
        '': {
            'cpu': 'cpu',
            'disk': 'disk_percent',
            'memory': 'memory_percent',
            'network.recv': None,
            'network.sent': None,
        },
        'gpu': {
            'gpu': 'gpu',
            'memory': 'gpu_memory_percent',
            'memoryAllocated': None,
            'powerPercent': None,
            'powerWatts': 'gpu_power_watts',
            'temp': 'gpu_temp',
        },
        'proc': {
            'cpu.threads': None,
            'memory.availableMB': None,
            'memory.percent': 'p_memory_percent',
            'momory.rssMB': None,
        }
    }

    name = re.sub(r'^system\.', '', key)
    gpu_idx_pattern = re.compile(r'^[0-9]+\.')

    # Triage & Remap name for aim ui
    if name.startswith('gpu'):
        name = re.sub(r'^gpu\.', '', name)

        # Cut & paste gpu idx from name to context
        gpu_idx_match = gpu_idx_pattern.search(name)
        if gpu_idx_match:
            gpu_idx_str = gpu_idx_match.group()
            name = name[len(gpu_idx_str):]
            gpu_idx = int(gpu_idx_str.rstrip('.'))
            context = {'gpu': gpu_idx, 'tag': 'system', 'subset': 'gpu'}
        else:
            context = {'gpu': 'no_idx', 'tag': 'system', 'subset': 'gpu'}

        normalized_name = SYSTEM_METRICS_NAME_MAP['gpu'].get(name)

    elif name.startswith('proc'):
        name = re.sub(r'^proc\.', '', name)
        normalized_name = SYSTEM_METRICS_NAME_MAP['proc'].get(name)
        context = {'tag': 'system', 'subset': 'proc'}

    else:
        normalized_name = SYSTEM_METRICS_NAME_MAP[''].get(name)
        context = {'tag': 'system'}

    return normalized_name, context

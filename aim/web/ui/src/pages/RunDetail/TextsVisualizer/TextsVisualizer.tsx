import React from 'react';
import Iframe from 'react-iframe';
import Viewer from 'miew-react';
import MaterialReactTable, { MRT_ColumnDef } from 'material-react-table';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';

import ErrorBoundary from 'components/ErrorBoundary/ErrorBoundary';
import DataList from 'components/kit/DataList';

import { ITableRef } from 'types/components/Table/Table';

import { ITextsVisualizerProps } from '../types';

import './TextsVisualizer.scss';

const MyFullScreen = (props: any) => {
  const handler = useFullScreenHandle();
  return (
    <>
      <button
        className='btn button'
        onClick={handler.enter}
        style={{ zIndex: 99999 }}
      >
        Enter fullscreen
      </button>
      <FullScreen className='myfullscreen' handle={handler}>
        {props.children}
      </FullScreen>
    </>
  );
};

function is_all_custom_data(rs: any): Boolean {
  if (!rs) {
    return false;
  }
  for (var i = 0; i < rs.length; i++) {
    if (!rs[i].text.startsWith('data:text/')) {
      return false;
    }
  }
  return true;
}

function is_table_data(content: string): Boolean {
  return content.startsWith('data:text/table,');
}

function is_moleculer_data(content: string): Boolean {
  let molecular_types = new Set<string>();
  molecular_types.add('data:text/pdb');
  molecular_types.add('data:text/sdf');
  molecular_types.add('data:text/pdbqt');
  molecular_types.add('data:text/mol2');
  return molecular_types.has(content.split(',', 1)[0]);
}

function is_html_data(content: string): Boolean {
  return content.startsWith('data:text/html,');
}

function render_table_data(content: string) {
  content = content.substring('data:text/table,'.length);
  var data: any;
  try {
    data = JSON.parse(content);
  } catch (e) {
    console.log(e);
    return null;
  }
  const columns: MRT_ColumnDef<any>[] = data?.columns.map((name: string) => ({
    accessorKey: name,
    header: name,
  }));
  const records = data.data.map((rs: any) =>
    data.columns.reduce((d: any, column: string, i: number) => {
      d[column] = rs[i];
      return d;
    }, {}),
  );
  return (
    <MaterialReactTable
      columns={columns}
      data={records}
      enableFullScreenToggle={true}
    />
  );
}

function init_miew(content: string, dtype: string) {
  function x(miew: any): void {
    miew.run();
    try {
      miew.load(content, { sourceType: 'immediate', fileType: dtype });
    } catch (e) {
      console.log(e);
    }
  }
  return x;
}

function render_moleculer_data(content: string) {
  const dtype = content.substring(0, content.indexOf(',')).split('/')[1];
  content = content.substring(content.indexOf(',') + 1);
  try {
    return (
      <div style={{ height: '300px', position: 'relative' }}>
        <MyFullScreen>
          <Viewer
            onInit={init_miew(content, dtype)}
            options={{
              settings: {
                editing: true,
                interpolateViews: true,
                zSprite: true,
              },
            }}
          />
        </MyFullScreen>
      </div>
    );
  } catch (e) {
    console.log(e);
  }
}

function render_html_data(content: string) {
  content = content.substring('data:text/html,'.length);
  return (
    <div>
      <MyFullScreen>
        <Iframe
          url={'data:text/html,' + encodeURIComponent(content)}
          width='100%'
          height='100%'
          loading='lazy'
          className=''
          display='block'
          position='relative'
          allowFullScreen={true}
          styles={{ border: '1px solid #FFA630', backgroudColor: '#fff' }}
        />
      </MyFullScreen>
    </div>
  );
}

function TextsVisualizer(
  props: ITextsVisualizerProps | any,
): React.FunctionComponentElement<React.ReactNode> {
  const tableRef = React.useRef<ITableRef>(null);

  const tableColumns = [
    {
      dataKey: 'step',
      key: 'step',
      title: 'Step',
      width: 100,
    },
    {
      dataKey: 'index',
      key: 'index',
      title: 'Index',
      width: 100,
    },
    {
      dataKey: 'text',
      key: 'text',
      title: 'Text',
      width: 0,
      flexGrow: 1,
      // TODO: replace with a wrapper component for all types of texts visualization
      // eslint-disable-next-line react/display-name
      cellRenderer: ({ cellData }: any) => (
        <div className='ScrollBar__hidden' style={{ overflow: 'auto' }}>
          <pre>{cellData}</pre>
        </div>
      ),
    },
  ];
  return (
    <ErrorBoundary>
      <div
        className='TextsVisualizer'
        style={{ height: '100%', overflow: 'auto' }}
      >
        {is_all_custom_data(props?.data?.processedValues) ? (
          (props?.data?.processedValues || [])
            .reverse()
            .map((object: any, index: number) => (
              <div key={'boxes-' + index}>
                <span>{object.step}</span>
                {is_moleculer_data(object.text)
                  ? render_moleculer_data(object.text)
                  : null}
                {is_table_data(object.text)
                  ? render_table_data(object.text)
                  : null}
                {is_html_data(object.text)
                  ? render_html_data(object.text)
                  : null}
              </div>
            ))
        ) : (
          <DataList
            tableRef={tableRef}
            tableData={props?.data?.processedValues}
            tableColumns={tableColumns}
            isLoading={props?.isLoading}
            searchableKeys={['text']}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

TextsVisualizer.displayName = 'TextsVisualizer';

export default React.memo<ITextsVisualizerProps>(TextsVisualizer);

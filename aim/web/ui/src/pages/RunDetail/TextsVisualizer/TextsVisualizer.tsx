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
        onClick={handler.enter}
        style={{ zIndex: 99999, left: '55%', position: 'fixed' }}
      >
        Enter Full-Screen Mode
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

function html_escape(html: string) {
  var rules = [
    { expression: /&/g, replacement: '&amp;' }, // keep this rule at first position
    { expression: /</g, replacement: '&lt;' },
    { expression: />/g, replacement: '&gt;' },
    { expression: /"/g, replacement: '&quot;' },
    { expression: /'/g, replacement: '&#039;' }, // or  &#39;  or  &#0039;
    // &apos;  is not supported by IE8
    // &apos;  is not defined in HTML 4
  ];
  var result = html.toString();
  for (var i = 0; i < rules.length; ++i) {
    var rule = rules[i];
    result = result.replaceAll(rule.expression, rule.replacement);
  }
  return result;
}

function render_large_table_data(data: any) {
  var html: string = `data:text/html,<html>
  <head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.3/jquery.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/datatables/1.10.21/js/jquery.dataTables.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/datatables/1.10.21/css/jquery.dataTables.min.css">
  </head>
  <div id="abc">
  `;

  html += '<table class="dataframe">';
  html += '<thead><tr>';
  for (var i = 0; i < data.columns.length; i++) {
    html += '<th>' + html_escape(data.columns[i]) + '</th>';
  }
  html += '</tr></thead>';
  html += '<tbody>';
  for (var i = 0; i < data.data.length; i++) {
    html += '<tr>';
    for (var j = 0; j < data.data[i].length; j++) {
      html += '<td>' + html_escape(data.data[i][j]) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody>';
  html += '<table>';
  html += `
  <div>
<script>
$(document).ready(function () {
    $('.dataframe').DataTable();
});
</script>
</html>
  `;
  return render_html_data(html, true);
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
  if (data.columns.length > 50) {
    return render_large_table_data(data);
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
      miew.load(content, {
        sourceType: 'immediate',
        fileType: dtype,
        keepRepsInfo: true,
      });
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
                ao: true,
                aromatic: true,
                fps: true,
                fxaa: true,
                outline: true,
                fox: true,
                autobuild: true,
                editing: true,
                interpolateViews: false,
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

function render_moleculer_data2(content: string) {
  const dtype = content.substring(0, content.indexOf(',')).split('/')[1];
  content = content.substring(content.indexOf(',') + 1);
  const html: string =
    `data:text/html,<!DOCTYPE html>
  <html lang="en">
  <head>
    <title>NGL - embedded</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, user-scalable=no, minimum-scale=1.0, maximum-scale=1.0">
  </head>
  <body>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/ngl/2.0.2/ngl.js"></script>
    <script>
      var stage;
      function toggleFullscreen() {
        stage.toggleFullscreen();
      }
      var stringBlob = new Blob([decodeURIComponent("` +
    encodeURIComponent(content) +
    `")], { type: 'text/plain'} );
      document.addEventListener("DOMContentLoaded", function () {
        stage = new NGL.Stage("viewport", { backgroundColor: "black" } );
        stage.loadFile( stringBlob, {defaultRepresentation: true, ext: "` +
    dtype +
    `"});
        stage.setSpin(true);
      });
    </script>
    <button onclick="toggleFullscreen()" style="position: fixed;top: 0;right: 50%;z-index: 100;"><span>Enter Full-Screen Mode</span></button>
    <div style="width:100%; height:300px;">
      <div id="viewport" style="width:100%; height:100%;"></div>
    </div>
  </body>
  </html>`;
  return render_html_data(html, false);
}

function render_html_data(content: string, autoFullScreenBtn: Boolean) {
  content = content.substring('data:text/html,'.length);
  const elem = (
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
  );
  return (
    <div style={{ height: '300px', position: 'relative' }}>
      {autoFullScreenBtn ? <MyFullScreen>{elem}</MyFullScreen> : elem}
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
          (props?.data?.processedValues || []).reverse().map((object: any) => (
            <div key={'custom-resource-' + object.step}>
              <span>{object.step}</span>
              {is_moleculer_data(object.text)
                ? render_moleculer_data2(object.text)
                : null}
              {is_table_data(object.text)
                ? render_table_data(object.text)
                : null}
              {is_html_data(object.text)
                ? render_html_data(object.text, true)
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

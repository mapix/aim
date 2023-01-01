import React from 'react';
import Iframe from 'react-iframe';
import { FullScreen, useFullScreenHandle } from 'react-full-screen';

import ErrorBoundary from 'components/ErrorBoundary/ErrorBoundary';
import DataList from 'components/kit/DataList';

import { ITableRef } from 'types/components/Table/Table';

import { ITextsVisualizerProps } from '../types';

import './TextsVisualizer.scss';

const fullScreenBtnCSS = `
<style>
body {
  background: white;
}
.fullscreen-button {
  position: absolute;
  z-index: 100;
  top:  5px;
  right:  5px;
  background: rgba(0,0,0,0.05);
  border:  0;
  width:  40px;
  height:  40px;
  border-radius: 50%;
  box-sizing: border-box;
  transition:  transform .3s;
  font-size: 0;
  opacity: 1;
  pointer-events: auto;
  cursor:  pointer;
}
.fullscreen-button:hover {
  transform: scale(1.125);
}
.fullscreen-button span {
  background: white;
  width:  4px;
  height:  4px;
  border-top:  2.5px solid #111; /* color */
  border-left:  2.5px solid #111; /* color */
  position: absolute;
  outline: 1px solid transparent;
  -webkit-backface-visibility: hidden;
  transform: translateZ(0);
  will-change: transform;
  -webkit-perspective: 1000;
  transition:  .3s;
  transition-delay: .75s;
}
.fullscreen-button span:nth-child(1) {
  top: 11px;
  left: 11px;
}
.fullscreen-button span:nth-child(2) {
  top: 11px;
  left: 22px;
  transform: rotate(90deg);
}
.fullscreen-button span:nth-child(3) {
  top: 22px;
  left: 11px;
  transform: rotate(-90deg);
}
.fullscreen-button span:nth-child(4) {
  top: 22px;
  left: 22px;
  transform: rotate(-180deg);
}

/* Fullscreen True
------------------------------*/
[fullscreen] .fullscreen-button span:nth-child(1) {
  top: 22px;
  left: 22px;
}
[fullscreen] .fullscreen-button span:nth-child(2) {
  top: 22px;
  left: 11px;
}
[fullscreen] .fullscreen-button span:nth-child(3) {
  top: 11px;
  left: 22px;
}
[fullscreen] .fullscreen-button span:nth-child(4) {
  top: 11px;
  left: 11px;
}

/* Dark Style
------------------------------*/
[light-mode=dark] {
  background: #111;
  color:  #fff;
}
[light-mode=dark] .fullscreen-button {
  background: rgba(255,255,255,.05);
}

[light-mode=dark] .fullscreen-button span {
  border-top:  2.5px solid #fff;
  border-left:  2.5px solid #fff;
}
</style>
`;
const MyFullScreen = (props: any) => {
  const handler = useFullScreenHandle();
  return (
    <>
      <button className='fullscreen-button' onClick={handler.enter}>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </button>
      <FullScreen className='myfullscreen' handle={handler}>
        {props.children}
      </FullScreen>
    </>
  );
};

function dataurlToBlobUrl(url: any) {
  var parts = url.split(',', 2);
  var mime = parts[0].substr(5).split(';')[0];
  var blob = b64toBlob(parts[1], mime);
  return URL.createObjectURL(blob);
}

const b64toBlob = (b64Data: any, contentType = '', sliceSize = 512) => {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
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

function render_raw_moleculer_iframe(content: string) {
  const dtype = content.substring(0, content.indexOf(',')).split('/')[1];
  content = content.substring(content.indexOf(',') + 1);
  var blob = new Blob([content], {
    type: 'text/plain',
  });
  const url = URL.createObjectURL(blob);
  const html: string =
    `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, user-scalable=no, minimum-scale=1.0, maximum-scale=1.0">
` +
    fullScreenBtnCSS +
    `
  </head>
  <body>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/ngl/2.0.2/ngl.js"></script>
    <script>
      var stage;
      function toggleFullscreen() {
        stage.toggleFullscreen();
      }
      document.addEventListener("DOMContentLoaded", function () {
        stage = new NGL.Stage("viewport", { backgroundColor: "white" } );
        stage.loadFile("` +
    url +
    '", {defaultRepresentation: true, ext: "' +
    dtype +
    `"});
        stage.setSpin(true);
      });
    </script>
    <button class="fullscreen-button" onclick="toggleFullscreen()">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div style="width:100%; height:300px;">
      <div id="viewport" style="width:100%; height:100%;"></div>
    </div>
  </body>
  </html>`;
  return html;
}

function render_table_data(content: any) {
  content = content.substring('data:text/table,'.length);
  var data: any;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return null;
  }
  var html: string =
    `data:text/html,<html>
  <head>
  <script src="https://code.jquery.com/jquery-3.5.1.js"></script>
  <script src="https://cdn.datatables.net/1.13.1/js/jquery.dataTables.min.js"></script>
  <script src="https://cdn.datatables.net/1.13.1/js/dataTables.bootstrap5.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/5.2.0/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.datatables.net/1.13.1/css/dataTables.bootstrap5.min.css">
  ` + fullScreenBtnCSS;

  html += `</head><script>
  function go_fullscreen(elem){
    elem.nextSibling.requestFullscreen();
    return false;
  }
  </script>`;
  html += '<table class="table table-striped" style="width:100%">';
  html += '<thead><tr>';
  for (var i = 0; i < data.columns.length; i++) {
    html += '<th>' + html_escape(data.columns[i]) + '</th>';
  }
  html += '</tr></thead>';
  html += '<tbody>';
  for (var i = 0; i < data.data.length; i++) {
    html += '<tr>';
    for (var j = 0; j < data.data[i].length; j++) {
      if (
        data.data[i][j] &&
        data.data[i][j].toString().startsWith('data:image/')
      ) {
        const url = dataurlToBlobUrl(data.data[i][j]);
        html +=
          `<td> <div style="position: relative;"><button class="fullscreen-button" onclick="go_fullscreen(this)">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </button><img src="` +
          url +
          '" loading="lazy" height="200px" width="200px"></div></td>';
      } else if (
        data.data[i][j] &&
        data.data[i][j].toString().startsWith('data:text/')
      ) {
        var blob = new Blob([render_raw_moleculer_iframe(data.data[i][j])], {
          type: 'text/html',
        });
        const url = URL.createObjectURL(blob);
        html +=
          '<td><iframe src="' +
          url +
          '" loading="lazy" allow="fullscreen" width="200px" height="200px" style="border: 0; color: white;"></iframe></td>';
      } else {
        html +=
          '<td>' +
          (data.data[i][j] ? html_escape(data.data[i][j].toString()) : '') +
          '</td>';
      }
    }
    html += '</tr>';
  }
  html += '</tbody>';
  html += '<table>';
  html += `
  <div>
<script>
$(document).ready(function () {
    $('table').DataTable();
});
</script>
</html>
  `;
  return render_html_data(html);
}

function render_moleculer_data(content: string) {
  const html = render_raw_moleculer_iframe(content);
  return render_html_data(html);
}

function render_html_data(content: string) {
  content = content.substring('data:text/html,'.length);
  var blob = new Blob([content], {
    type: 'text/html',
  });
  const url = URL.createObjectURL(blob);
  return (
    <div style={{ height: '300px', position: 'relative' }}>
      <MyFullScreen>
        <Iframe
          url={url}
          width='100%'
          height='100%'
          loading='lazy'
          className=''
          display='block'
          position='relative'
          allowFullScreen={true}
          styles={{
            border: '1px solid rgb(233 232 231)',
            backgroudColor: '#fff',
            padding: '20px',
          }}
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
          (props?.data?.processedValues || []).reverse().map((object: any) => (
            <div key={'custom-resource-' + object.step}>
              <section>
                <p>Step {object.step}</p>
                {is_moleculer_data(object.text)
                  ? render_moleculer_data(object.text)
                  : null}
                {is_table_data(object.text)
                  ? render_table_data(object.text)
                  : null}
                {is_html_data(object.text)
                  ? render_html_data(object.text)
                  : null}
              </section>
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

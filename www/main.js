import init, { Validator } from './pkg/cjval_wasm.js';

const allerrors = [
  "err_json_syntax",
  "err_schema",
  "err_ext_schema",
  "err_parents_children_consistency",
  "err_wrong_vertex_index",
  "err_semantics_arrays",
  "err_materials",
  "err_textures",
  "war_duplicate_vertices",
  "war_unused_vertices",
  "war_extra_root_properties",
];

async function main() {
  await init();
  reset_results();

  var dropbox = document.getElementById("dropbox");
  dropbox.addEventListener("dragenter", dragenter, false);
  dropbox.addEventListener("dragover", dragover, false);
  dropbox.addEventListener("drop", drop, false);
  dropbox.addEventListener("click", click, false);
  dropbox.addEventListener("change", () => {
    handleFiles(document.getElementById('fileElem').files);
  });

  ['dragover'].forEach(eventName => {
    dropbox.addEventListener(eventName, highlight, false);
  });
  ['dragleave', 'drop'].forEach(eventName => {
    dropbox.addEventListener(eventName, unhighlight, false);
  });

  function highlight(e) { dropbox.classList.add('highlight'); }
  function unhighlight(e) { dropbox.classList.remove('highlight'); }
  function dragenter(e) { e.stopPropagation(); e.preventDefault(); }
  function dragover(e) { e.stopPropagation(); e.preventDefault(); }

  function drop(e) {
    e.stopPropagation();
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function click(e) {
    document.getElementById('fileElem').click();
  }
}

async function handleFiles(files) {
  if (files[0] == null) return;
  reset_results();

  var f = files[0];
  var extension = f.name.split('.').pop().toLowerCase();

  document.getElementById('filename').innerHTML = f.name;
  document.getElementById('inputsummary').classList.remove('hidden');

  if (extension == 'json') {
    var reader = new FileReader();
    reader.readAsText(f);
    reader.onload = function() {
      let validator = Validator.from_str(reader.result);
      let cjv = validator.get_input_cityjson_version();
      let cjschemav = validator.get_cityjson_schema_version();
      if (cjv == 20) {
        document.getElementById('cjversion').innerHTML = "CityJSON v2.0 (schemas used: v" + cjschemav + ")";
      } else if (cjv == 11) {
        document.getElementById('cjversion').innerHTML = "v1.1 (it would be a good idea to <a href='https://www.cityjson.org/tutorials/upgrade20/'>upgrade to v2.0</a>)";
      } else if (cjv == 10) {
        document.getElementById('cjversion').innerHTML = "v1.0 (it would be a good idea to <a href='https://www.cityjson.org/tutorials/upgrade20/'>upgrade to v2.0</a>)";
      } else {
        document.getElementById('cjversion').innerHTML = "version &lt;1.0 (no validation possible)";
      }
      download_all_extensions(validator, () => {
        allvalidations(validator);
      });
    };

  } else if (extension == 'jsonl') {
    var table1 = document.getElementById("tab_cjf_summary");
    var reader = new FileReader();

    reader.onload = (event) => {
      const lines = event.target.result.split('\n');
      let validator = Validator.from_str(lines[0]);
      let cjv = validator.get_input_cityjson_version();
      let cjschemav = validator.get_cityjson_schema_version();
      if (cjv == 20) {
        document.getElementById('cjversion').innerHTML = "CityJSONFeature v2.0 (schemas used: v" + cjschemav + ")";
      } else if (cjv == 11) {
        document.getElementById('cjversion').innerHTML = "CityJSONFeature v1.1 (it would be a good idea to <a href='https://www.cityjson.org/tutorials/upgrade20/'>upgrade to v2.0</a>)";
      } else {
        document.getElementById('cjversion').innerHTML = "CityJSONFeature version &lt;=1.0 (no validation possible)";
      }

      let row = document.createElement("tr");
      let c1 = document.createElement("td");
      let c2 = document.createElement("td");
      c1.innerText = 1;
      row.appendChild(c1);
      row.appendChild(c2);
      table1.appendChild(row);

      const banner = document.getElementById("result-banner");
      banner.innerHTML = '<span class="spinning-cog">⚙️</span> Validating…';
      banner.className = 'result-banner validating';

      download_all_extensions(validator, async () => {
        validator.validate();
        var status = validator.get_status();
        var errs = validator.get_errors_string();
        // worst status seen across all lines: -1 = errors, 0 = warnings, 1 = valid
        let worstStatus = status;
        if (status == 1) {
          c2.innerText = "✅";
        } else if (status == 0) {
          c2.innerText = "🟡 " + errs;
        } else {
          c2.innerText = "❌ (first line must be a valid CityJSON object) | " + errs;
        }

        const CHUNK_SIZE = 50;
        const totalFeatures = lines.filter((l, i) => i >= 1 && l !== "").length;
        const totalLines = totalFeatures + 1;
        c1.innerHTML = `1<span class="line-total">/${totalLines}</span>`;
        let processed = 0;

        let fragment = document.createDocumentFragment();

        for (let index = 1; index < lines.length; index++) {
          const item = lines[index];
          if (item === "") continue;

          let row = document.createElement("tr");
          let c1 = document.createElement("td");
          let c2 = document.createElement("td");
          c1.innerHTML = `${index + 1}<span class="line-total">/${totalLines}</span>`;
          row.appendChild(c1);
          row.appendChild(c2);

          try {
            validator.from_str_cjfeature(item);
            validator.validate();
            var st = validator.get_status();
            if (st < worstStatus) worstStatus = st;
            if (st == 1) {
              c2.innerText = "✅";
            } else if (st == 0) {
              c2.innerText = "🟡 " + validator.get_errors_string();
            } else {
              c2.innerText = "❌ " + validator.get_errors_string();
            }
          } catch(e) {
            worstStatus = -1;
            c2.innerText = "❌ " + e;
          }

          fragment.appendChild(row);
          processed++;

          if (processed % CHUNK_SIZE === 0) {
            table1.appendChild(fragment);
            fragment = document.createDocumentFragment();
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        // flush remaining rows
        table1.appendChild(fragment);

        if (worstStatus == 1) {
          banner.innerHTML = "✅ All features are valid!";
          banner.className = "result-banner valid";
        } else if (worstStatus == 0) {
          banner.innerHTML = "🟡 All features are valid but some have warnings";
          banner.className = "result-banner warnings";
        } else {
          banner.innerHTML = "❌ Some features are invalid";
          banner.className = "result-banner invalid";
        }
      });
    };

    reader.readAsText(f);
    document.getElementById("tab_cjf_summary").classList.remove('hidden');

  } else {
    wrong_filetype("File type not allowed (only .json and .jsonl)");
  }

  document.getElementById('fileElem').value = "";
}

function reset_results() {
  // Rebuild CityJSONSeq table header
  var t = document.getElementById("tab_cjf_summary");
  var trs = t.getElementsByTagName("tr");
  while (trs.length > 0) trs[0].parentNode.removeChild(trs[0]);
  let head = document.createElement("thead");
  let tr = document.createElement("tr");
  let th1 = document.createElement("th");
  let th2 = document.createElement("th");
  th1.innerText = "line#";
  th2.innerText = "valid?";
  tr.appendChild(th1);
  tr.appendChild(th2);
  head.appendChild(tr);
  t.appendChild(head);

  document.getElementById("results-panels").classList.add('hidden');
  document.getElementById("tab_cjf_summary").classList.add('hidden');
  document.getElementById("theextensions").innerHTML = '';

  const banner = document.getElementById("result-banner");
  banner.innerHTML = '';
  banner.className = 'hidden';

  for (let id of allerrors) {
    let e = document.getElementById(id);
    e.className = "check-row";
    e.children[1].innerHTML = "";
  }
}

function wrong_filetype(s) {
  const banner = document.getElementById("result-banner");
  banner.innerHTML = "❌ " + s;
  banner.className = "result-banner invalid";
  document.getElementById("results-panels").classList.remove('hidden');
}

function display_final_result(isValid, hasWarnings) {
  document.getElementById("results-panels").classList.remove('hidden');
  const banner = document.getElementById("result-banner");
  if (isValid) {
    if (!hasWarnings) {
      banner.innerHTML = "✅ The file is 100% valid!";
      banner.className = "result-banner valid";
    } else {
      banner.innerHTML = "🟡 The file is valid but has warnings";
      banner.className = "result-banner warnings";
    }
  } else {
    banner.innerHTML = "❌ The file is invalid";
    banner.className = "result-banner invalid";
  }
}

function download_all_extensions(val, _callback) {
  let re = val.get_extensions_urls();
  if (re != null) {
    const entries = re.split('\n').map(e => {
      const sep = e.indexOf('|');
      return { name: e.substring(0, sep), url: e.substring(sep + 1) };
    });
    var promises = entries.map(p =>
      fetch(p.url)
        .then(y => y.text())
        .catch((error) => { console.error('Error:', error); })
    );
    Promise.all(promises).then(results => {
      for (let i = 0; i < results.length; i++) {
        const li = document.createElement("li");
        li.innerHTML = `[${entries[i].name}] <a href="${entries[i].url}">${entries[i].url}</a>`;
        const sp = document.createElement("span");

        if (typeof results[i] === 'undefined') {
          sp.innerHTML = " <em>(error)</em>";
          li.appendChild(sp);
          document.getElementById("theextensions").appendChild(li);
          document.getElementById('err_ext_schema').className = "check-row error";
          document.getElementById('err_ext_schema').children[1].innerHTML =
            "Cannot download Extension schema (maybe because of CORS, <a href='https://github.com/cityjson/cjval/issues/1'>how to fix this</a>)";
          display_final_result(false, false);
          return;
        } else if (results[i] == "404: Not Found") {
          sp.innerHTML = " <em>(not found)</em>";
          li.appendChild(sp);
          document.getElementById("theextensions").appendChild(li);
          document.getElementById('err_ext_schema').className = "check-row error";
          document.getElementById('err_ext_schema').children[1].innerHTML = "Extension schema cannot be found.";
          display_final_result(false, false);
          return;
        } else {
          let re = val.add_one_extension_from_str(entries[i].url, results[i]);
          if (re == null) {
            document.getElementById("theextensions").appendChild(li);
          } else {
            sp.innerHTML = " <em>(error)</em>";
            li.appendChild(sp);
            document.getElementById("theextensions").appendChild(li);
            document.getElementById('err_ext_schema').className = "check-row error";
            document.getElementById('err_ext_schema').children[1].innerHTML =
              `Extension: issues with parsing schema [${re}].`;
            display_final_result(false, false);
            return;
          }
        }
      }
      _callback();
    });
  } else {
    const li = document.createElement("li");
    li.innerHTML = "none";
    document.getElementById("theextensions").appendChild(li);
    _callback();
  }
}

function errorToHtml(str, maxLines) {
  const lines = str.split('\n').filter(l => l.trim() !== '');
  const shown = maxLines ? lines.slice(0, maxLines) : lines;
  const escaped = shown.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  let html = escaped.join('<br>');
  if (maxLines && lines.length > maxLines) {
    html += `<br><em>... and ${lines.length - maxLines} more</em>`;
  }
  return html;
}

function allvalidations(validator) {
  var isValid = true;
  var hasWarnings = false;
  validator.validate();

  try {
    validator.json_syntax();
    document.getElementById('err_json_syntax').className = "check-row ok";
  } catch(e) {
    document.getElementById('err_json_syntax').className = "check-row error";
    document.getElementById('err_json_syntax').children[1].innerHTML = errorToHtml(e);
    isValid = false;
    display_final_result(isValid, hasWarnings);
    return;
  }

  try {
    validator.schema();
    document.getElementById('err_schema').className = "check-row ok";
  } catch(e) {
    document.getElementById('err_schema').className = "check-row error";
    document.getElementById('err_schema').children[1].innerHTML = errorToHtml(e);
    isValid = false;
    display_final_result(isValid, hasWarnings);
    return;
  }

  if (validator.get_input_cityjson_version() > 10) {
    try {
      validator.extensions();
      document.getElementById('err_ext_schema').className = "check-row ok";
    } catch(e) {
      document.getElementById('err_ext_schema').className = "check-row error";
      document.getElementById('err_ext_schema').children[1].innerHTML = errorToHtml(e);
      isValid = false;
      display_final_result(isValid, hasWarnings);
      return;
    }
  } else {
    if (validator.number_extensions() > 0) {
      document.getElementById('err_ext_schema').className = "check-row error";
      document.getElementById('err_ext_schema').children[1].innerHTML =
        "validation of Extensions is not supported in v1.0, upgrade to v1.1";
      isValid = false;
      display_final_result(isValid, hasWarnings);
      return;
    }
  }

  try {
    validator.wrong_vertex_index();
    document.getElementById('err_wrong_vertex_index').className = "check-row ok";
  } catch(e) {
    document.getElementById('err_wrong_vertex_index').className = "check-row error";
    document.getElementById('err_wrong_vertex_index').children[1].innerHTML = errorToHtml(e);
    isValid = false;
  }

  try {
    validator.parents_children_consistency();
    document.getElementById('err_parents_children_consistency').className = "check-row ok";
  } catch(e) {
    document.getElementById('err_parents_children_consistency').className = "check-row error";
    document.getElementById('err_parents_children_consistency').children[1].innerHTML = errorToHtml(e);
    isValid = false;
  }

  try {
    validator.semantics_arrays();
    document.getElementById('err_semantics_arrays').className = "check-row ok";
  } catch(e) {
    document.getElementById('err_semantics_arrays').className = "check-row error";
    document.getElementById('err_semantics_arrays').children[1].innerHTML = errorToHtml(e);
    isValid = false;
  }

  try {
    validator.materials();
    document.getElementById('err_materials').className = "check-row ok";
  } catch(e) {
    document.getElementById('err_materials').className = "check-row error";
    document.getElementById('err_materials').children[1].innerHTML = errorToHtml(e);
    isValid = false;
  }

  try {
    validator.textures();
    document.getElementById('err_textures').className = "check-row ok";
  } catch(e) {
    document.getElementById('err_textures').className = "check-row error";
    document.getElementById('err_textures').children[1].innerHTML = errorToHtml(e);
    isValid = false;
  }

  if (!isValid) {
    display_final_result(isValid, hasWarnings);
    return;
  }

  // Warnings
  try {
    validator.duplicate_vertices();
    document.getElementById('war_duplicate_vertices').className = "check-row ok";
  } catch(e) {
    document.getElementById('war_duplicate_vertices').className = "check-row warning";
    document.getElementById('war_duplicate_vertices').children[1].innerHTML = errorToHtml(e, 10);
    hasWarnings = true;
  }

  try {
    validator.extra_root_properties();
    document.getElementById('war_extra_root_properties').className = "check-row ok";
  } catch(e) {
    document.getElementById('war_extra_root_properties').className = "check-row warning";
    document.getElementById('war_extra_root_properties').children[1].innerHTML = errorToHtml(e);
    hasWarnings = true;
  }

  try {
    validator.unused_vertices();
    document.getElementById('war_unused_vertices').className = "check-row ok";
  } catch(e) {
    document.getElementById('war_unused_vertices').className = "check-row warning";
    document.getElementById('war_unused_vertices').children[1].innerHTML = errorToHtml(e);
    hasWarnings = true;
  }

  display_final_result(isValid, hasWarnings);
}

main();

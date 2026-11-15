// チップ（ピル型ボタン）による単一選択グループ。selectの置き換えとして、
// 学習設定画面（テーマ／節/論点／問題形式／出題モード）と振り返り画面の絞り込みで共有する。
// 画面が増えても同じ部品を再利用できるよう、DOM生成・選択状態・変更通知のみを責務とする
// （データの意味づけ・カスケード関係は呼び出し側が持つ）。
(function () {
  "use strict";

  // opts: { items: [{value,label}], value: string, onChange: function(value) }
  function createChipGroup(container, opts) {
    opts = opts || {};
    var state = { value: opts.value != null ? opts.value : "all", labels: {} };

    function render(items) {
      container.innerHTML = "";
      state.labels = {};
      items.forEach(function (item) {
        state.labels[item.value] = item.label;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip" + (item.value === state.value ? " active" : "");
        btn.textContent = item.label;
        btn.dataset.value = item.value;
        btn.setAttribute("aria-pressed", item.value === state.value ? "true" : "false");
        btn.addEventListener("click", function () {
          if (state.value === item.value) return;
          setValue(item.value);
          if (opts.onChange) opts.onChange(item.value);
        });
        container.appendChild(btn);
      });
    }

    function setValue(value) {
      state.value = value;
      var chips = container.querySelectorAll(".chip");
      for (var i = 0; i < chips.length; i++) {
        var active = chips[i].dataset.value === value;
        chips[i].classList.toggle("active", active);
        chips[i].setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    // itemsが変わる（例：テーマ変更に伴う節の選択肢の作り直し）ときに使う。
    // valueを省略した場合は現在の選択を維持しようとせず、呼び出し側が明示的に指定する
    // （カスケードの下位階層は原則「すべて」に戻すため）。
    function setItems(items, value) {
      if (value !== undefined) state.value = value;
      render(items);
    }

    if (opts.items) render(opts.items);

    return {
      getValue: function () { return state.value; },
      getLabel: function () { return state.labels[state.value] || ""; },
      setValue: setValue,
      setItems: setItems,
    };
  }

  // v2-53: 複数選択できるチップグループ（学習状態の絞り込み用、ユーザー指示）。
  // 値は配列。"all"（すべて）は他と排他で、他をすべて外したときも"all"に戻る。
  // opts: { items: [{value,label}], value: string[], onChange: function(values) }
  function createMultiChipGroup(container, opts) {
    opts = opts || {};
    var ALL = "all";
    var selected = normalize(opts.value || [ALL]);
    var labels = {};

    function normalize(values) {
      var list = (values || []).filter(function (v) {
        return v !== ALL;
      });
      return list.length ? list : [ALL];
    }

    function sync() {
      var chips = container.querySelectorAll(".chip");
      for (var i = 0; i < chips.length; i++) {
        var active = selected.indexOf(chips[i].dataset.value) >= 0;
        chips[i].classList.toggle("active", active);
        chips[i].setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    container.innerHTML = "";
    (opts.items || []).forEach(function (item) {
      labels[item.value] = item.label;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = item.label;
      btn.dataset.value = item.value;
      btn.addEventListener("click", function () {
        if (item.value === ALL) {
          selected = [ALL];
        } else {
          var cur = selected.filter(function (v) {
            return v !== ALL;
          });
          var idx = cur.indexOf(item.value);
          if (idx >= 0) cur.splice(idx, 1);
          else cur.push(item.value);
          // 表示順（items順）にそろえておく
          selected = normalize(
            (opts.items || [])
              .map(function (it) {
                return it.value;
              })
              .filter(function (v) {
                return cur.indexOf(v) >= 0;
              })
          );
        }
        sync();
        if (opts.onChange) opts.onChange(selected.slice());
      });
      container.appendChild(btn);
    });
    sync();

    return {
      getValue: function () {
        return selected.slice();
      },
      getLabel: function () {
        return selected
          .map(function (v) {
            return labels[v] || v;
          })
          .join("・");
      },
      isAll: function () {
        return selected.length === 1 && selected[0] === ALL;
      },
      setValue: function (values) {
        selected = normalize(values);
        sync();
      },
    };
  }

  window.EVv2 = window.EVv2 || {};
  window.EVv2.createChipGroup = createChipGroup;
  window.EVv2.createMultiChipGroup = createMultiChipGroup;
})();

'use strict';
/* 自绘标题栏：窗口控制与拖拽（规范见 STYLE_GUIDE.md） */
const Titlebar = window.Titlebar = {
  init() {
    const mh = window.mh;
    const bar = document.getElementById('titlebar');
    const btnMin = document.getElementById('tb-min');
    const btnMax = document.getElementById('tb-max');
    const btnClose = document.getElementById('tb-close');
    if (!bar || !btnMin || !btnMax || !btnClose) return;

    btnMin.innerHTML = UI.icon('win-min', 14);
    btnClose.innerHTML = UI.icon('win-close', 14);
    const setMaxIcon = function (isMax) {
      btnMax.innerHTML = UI.icon(isMax ? 'win-restore' : 'win-max', 14);
      btnMax.title = isMax ? '向下还原' : '最大化';
    };

    btnMin.addEventListener('click', function () { mh.winMin(); });
    btnMax.addEventListener('click', function () { mh.winMax(); });
    btnClose.addEventListener('click', function () { mh.winClose(); });

    mh.onWinState(setMaxIcon);
    mh.isMaximized().then(setMaxIcon).catch(function () {});

    bar.addEventListener('dblclick', function (e) {
      if (e.target.closest('.tbtn')) return;
      mh.winMax();
    });
  }
};

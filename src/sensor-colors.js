const SENSOR_CLASS_MAP = {
  RGB: 'sensor-rgb',
  Termokamera: 'sensor-thermal',
  Multispektrál: 'sensor-multi',
  LiDAR: 'sensor-lidar',
  RTK: 'sensor-rtk',
  'Noční vidění': 'sensor-night'
};

function applySensorColors() {
  document.querySelectorAll('.sensor-tag').forEach(tag => {
    const sensor = tag.textContent?.trim();
    Object.values(SENSOR_CLASS_MAP).forEach(className => tag.classList.remove(className));
    const className = SENSOR_CLASS_MAP[sensor];
    if (className) tag.classList.add(className);
  });
}

let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applySensorColors();
  });
});

observer.observe(document.documentElement, { childList: true, subtree: true });
applySensorColors();

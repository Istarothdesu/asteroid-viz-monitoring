import { SCENE_VISUALS, type SceneLayerSection } from '@/core/sceneLayers'

export function groundSceneLayerSections(): SceneLayerSection[] {
  return [
    {
      id: 'ground-survey',
      title: '地面监测',
      defaultOpen: true,
      items: [
        { id: 'ground-sphere', label: '地心天球网格', detail: 'J2000 赤道坐标', visual: SCENE_VISUALS.grid },
        { id: 'ground-labels', label: '天球坐标文字', detail: '赤经 h / 赤纬 °', visual: SCENE_VISUALS.labels, visibilityKey: 'showGratLabels' },
        { id: 'station-cones', label: '观测站光锥', detail: '关闭时仅显示夜间站', visual: SCENE_VISUALS.viewCone, visibilityKey: 'showAllCones' },
      ],
    },
    {
      id: 'ground-constraints',
      title: '观测约束',
      defaultOpen: false,
      items: [
        { id: 'ground-occult', label: '日月遮挡区', visual: SCENE_VISUALS.occult, visibilityKey: 'showGroundOccult' },
        { id: 'ground-sun-avoid', label: '太阳规避区', detail: '45°', visual: SCENE_VISUALS.avoidance, visibilityKey: 'showGSunAvoid' },
        { id: 'moon-avoid', label: '月球规避区', detail: '45°', visual: SCENE_VISUALS.moonAvoidance, visibilityKey: 'showMoonAvoid' },
        { id: 'zodiac', label: '黄道带', detail: '±15° 小行星密集区', visual: SCENE_VISUALS.zodiac, visibilityKey: 'showZodiacBand' },
      ],
    },
  ]
}

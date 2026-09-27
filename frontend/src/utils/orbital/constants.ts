export const AU_KM    = 149597870.7
export const JD_J2000 = 2451545.0
export const KGAUSS   = 0.01720209895   // Gaussian gravitational constant (AU^1.5/day)
export const TAU      = Math.PI * 2
export const JULIAN_YEAR_DAYS = 365.25  // 儒略年：用户界面中的年/月时间尺度基准
export const YEAR_S   = TAU / KGAUSS      // 恒星年 (天): 开普勒周期 P = YEAR_S·a^1.5
export const D2R      = Math.PI / 180
export const R2D      = 180 / Math.PI
export const R_EARTH_AU  = 6371.0 / AU_KM
export const L1_DIST_AU  = 1500000 / AU_KM
export const OBLIQ    = 23.4393 * D2R   // mean obliquity of ecliptic

export const JD_MIN = Date.UTC(1900, 0, 1) / 86400000 + 2440587.5
export const JD_MAX = Date.UTC(2100, 0, 1) / 86400000 + 2440587.5

const ckUti = require('./check-util')

/*--------------------------------------------------*/
//#region Server Client 共通　

// 有効日付チェック
const isInvalidDate = (dt) => {
  return Number.isNaN(dt.getTime())
}

// 現在のUNIXタイムを取得
const getNowUtime = () => {
  return Math.floor((new Date()).getTime() / 1000)
}

// タイムからUNIXタイムを取得
const getTimeToUtime = (t) => {
  return Math.floor(t / 1000)
}

// UNIXタイムからタイムを取得
const getUtimeToTime = (ut) => {
  return (ut * 1000)
}

// 経過時間文字を取得
const getElapsedTimeStr = (ut) => {

  let str = ''

  const diff = getNowUtime() - ut

  if (diff >= 86400) {
    str = getUtimeToMonthDateStr(ut)
  } else if (diff >= 3600) {
    str = `${Math.floor(diff / (60 * 60))}時間前`
  } else if (diff >= 60) {
    str = `${Math.floor(diff / 60)}分前`
  } else if (diff > 0) {
    str = `${diff}秒前`
  }

  return str
}

// ISOフォーマット文字列からDateオブジェクトを取得
const getIsoToDate = (isoStr) => {
  let dt = null
  if (isoStr) {
    try {
      dt = new Date(isoStr)
      if (isInvalidDate(dt)) dt = null
    } catch {
      dt = null
    }
  }
  return dt
}

// ISOフォーマット文字列からUNIXタイムを取得
const getIsoToUtime = (isoStr) => {
  let ut = 0
  if (isoStr) {
    try {
      let dt = new Date(isoStr)
      ut = getTimeToUtime(dt.getTime())
    } catch {
      ut = 0
    }
  }
  return ut
}

// DateオブジェクトからUNIXタイムを取得
const getDateToUtime = (dt) => {
  let ut = 0
  if (dt) {
    ut = getTimeToUtime(dt.getTime())
  }
  return ut
}

// Dateオブジェクトからym(yyyymmの数値)を取得
const getDateToYm = (dt) => {
  let ym = 0
  if (dt) {
    let y  = dt.getFullYear()
    let m = dt.getMonth() + 1
    if (m < 10) m = '0' + m
    ym = Number(`${y}${m}`)
  }
  return ym
}

// Dateオブジェクトからymd(yyyymmddの数値)を取得
const getDateToYmd = (dt) => {
  let ymd = 0
  if (dt) {
    let y  = dt.getFullYear()
    let m = dt.getMonth() + 1
    if (m < 10) m = '0' + m
    let d = dt.getDate()
    if (d < 10) d = '0' + d
    ymd = Number(`${y}${m}${d}`)
  }
  return ymd
}

// DateオブジェクトからISOフォーマット文字列
const getDateToIso = (dt) => {
  let iso = ''
  if (dt) {
    let Y = dt.getFullYear()
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let D = dt.getDate()
    if (D < 10) D = '0' + D
    let h = dt.getHours()
    if (h < 10) h = '0' + h
    let m = dt.getMinutes()
    if (m < 10) m = '0' + m
    iso = `${Y}-${M}-${D}T${h}:${m}`
  }
  return iso
}

// Dateオブジェクトから年月日文字列
const getDateToYearMonthDateStr = (dt, splitStr) => {
  let str = ''
  const s = (splitStr) ? splitStr : '/'
  if (dt) {
    let Y = dt.getFullYear()
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let D = dt.getDate()
    if (D < 10) D = '0' + D
    str = `${Y}${s}${M}${s}${D}`
  }
  return str
}

// Dateオブジェクトから年月日時文字列
const getDateToYearMonthDateTimeStr = (dt) => {
  let str = ''
  if (dt) {
    let Y = dt.getFullYear()
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let D = dt.getDate()
    if (D < 10) D = '0' + D
    let h = dt.getHours()
    if (h < 10) h = '0' + h
    let m = dt.getMinutes()
    if (m < 10) m = '0' + m
    str = `${Y}/${M}/${D} ${h}:${m}`
  }
  return str
}

// Dateオブジェクトから月日時文字列
const getDateToMonthDateTimeStr = (dt) => {
  let str = ''
  if (dt) {
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let D = dt.getDate()
    if (D < 10) D = '0' + D
    let h = dt.getHours()
    if (h < 10) h = '0' + h
    let m = dt.getMinutes()
    if (m < 10) m = '0' + m
    str = `${M}/${D} ${h}:${m}`
  }
  return str
}

// Dateオブジェクトから曜日文字列
const getDateToWeekStr = (dt) => {
  if (dt) {
    const week = dt.getDay()
    switch (week){
      case 0:
        return '日' 
      case 1:
        return '月'
      case 2:
        return '火'
      case 3:
        return '水'
      case 4:
        return '木'
      case 5:
        return '金'
      case 6:
        return '土'
      default:
        return ''
    }
  }
  return ''
}

// Dateオブジェクトから年月日文字列(日本語)
const getDateToYearMonthDateJpnStr = (dt) => {
  let str = ''
  if (dt) {
    let Y = dt.getFullYear()
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let D = dt.getDate()
    if (D < 10) D = '0' + D
    str = `${Y}年${M}月${D}日`
  }
  return str
}

// Dateオブジェクトから年月文字列(日本語)
const getDateToYearMonthJpnStr = (dt) => {
  let str = ''
  if (dt) {
    let Y = dt.getFullYear()
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    str = `${Y}年${M}月`
  }
  return str
}

// Dateオブジェクトから月日文字列(日本語)
const getDateToMonthDateJpnStr = (dt) => {
  let str = ''
  if (dt) {
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let D = dt.getDate()
    if (D < 10) D = '0' + D
    str = `${M}月${D}日`
  }
  return str
}

// UNIXタイムから月日文字列
const getUtimeToMonthDateStr = (ut) => {
  let str = ''
  if (ut) {
    let dt = new Date(getUtimeToTime(ut))
    let m = dt.getMonth() + 1
    if (m < 10) m = '0' + m
    let d = dt.getDate()
    if (d < 10) d = '0' + d
    str = `${m}/${d}`
  }
  return str
}

// UNIXタイムから時文字列
const getUtimeToTimeStr = (ut) => {
  let str = ''
  if (ut) {
    let dt = new Date(getUtimeToTime(ut))
    let h  = dt.getHours()
    if (h < 10) h = '0' + h
    let m = dt.getMinutes()
    if (m < 10) m = '0' + m
    str = `${h}:${m}`
  }
  return str
}

// UNIXタイムからDateオブジェクトを取得
const getUtimeToDate = (ut) => {
  let dt = null
  if (ut) {
    try {
      dt = new Date(getUtimeToTime(ut))
      if (isInvalidDate(dt)) dt = null
    } catch {
      dt = null
    }
  }
  return dt
}

// UNIXタイムからymd(yyyymmddの数値)を取得
const getUtimeToYmd = (ut) => {
  let ymd = 0
  if (ut) {
    let dt = new Date(getUtimeToTime(ut))
    let y  = dt.getFullYear()
    let m = dt.getMonth() + 1
    if (m < 10) m = '0' + m
    let d = dt.getDate()
    if (d < 10) d = '0' + d
    ymd = Number(`${y}${m}${d}`)
  }
  return ymd
}

// UNIXタイムから年月日時文字列
const getUtimeToYearMonthDateTimeStr = (ut) => {
  let str = ''
  let dt = getUtimeToDate(ut)
  if (dt) {
    str = getDateToYearMonthDateTimeStr(dt)
  }
  return str
}

// UNIXタイムから月日時文字列
const getUtimeToMonthDateTimeStr = (ut) => {
  let str = ''
  let dt = getUtimeToDate(ut)
  if (dt) {
    str = getDateToMonthDateTimeStr(dt)
  }
  return str
}

// UNIXタイムから月日時文字列(日本語)
const getUtimeToYearMonthDateJpnStr = (ut) => {
  let str = ''
  if (ut) {
    let dt = new Date(getUtimeToTime(ut))
    let y = dt.getFullYear()
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let d = dt.getDate()
    if (d < 10) d = '0' + d
    str = `${y}年${M}月${d}日`
  }
  return str
}

// UNIXタイムから月日時文字列(日本語)
const getUtimeToMonthDateTimeJpnStr = (ut) => {
  let str = ''
  if (ut) {
    let dt = new Date(getUtimeToTime(ut))
    let M = dt.getMonth() + 1
    if (M < 10) M = '0' + M
    let d = dt.getDate()
    if (d < 10) d = '0' + d
    let h  = dt.getHours()
    if (h < 10) h = '0' + h
    let m = dt.getMinutes()
    if (m < 10) m = '0' + m
    str = `${M}月${d}日${h}時${m}分`
  }
  return str
}

// ymからDateオブジェクト(1日にして)
const getYmToDate = (ym) => {
  const ymStr = String(ym)
  const y = ymStr.substring(0, 4)
  const m = ymStr.substring(4, 6)
  let dt = null
  try {
    dt = new Date(`${y}-${m}-01`)
    if (isInvalidDate(dt)) dt = null
  } catch {
    dt = null
  }
  return dt
}

// ymdからDateオブジェクト
const getYmdToDate = (ymd) => {
  const ymdStr = String(ymd)
  const y = ymdStr.substring(0, 4)
  const m = ymdStr.substring(4, 6)
  const d = ymdStr.substring(6, 8)
  let dt = null
  try {
    dt = new Date(`${y}-${m}-${d}`)
    if (isInvalidDate(dt)) dt = null
  } catch {
    dt = null
  }
  return dt
}

// 秒数から時間文字取得
// UNIXタイムから月日時文字列(日本語)
const getSecToTimeStr = (sec) => {

  let str = '00:00'
  if (sec) {
    str = ''
    const h = Math.floor(sec / 3600)
    if (0 < h) str += `${h}:`
    const m = Math.floor((sec - (h * 3600)) / 60)
    str += `${m}:`
    const s = Math.floor((sec - (h * 3600) - (m * 60)))
    str += (s < 10) ? `0${s}` : `${s}`
  }

  return str
}

// 同じ日付チェック
const checkSameDate = (dt1, dt2) => {
  if (dt1.getFullYear() === dt2.getFullYear() && dt1.getMonth() === dt2.getMonth() && dt1.getDate() === dt2.getDate())
    return true
  else
    return false
}

// ym(yyyymmの数値)文字チェック
const checkYmStr = (str) => {
  try {
    if (ckUti.checkStrLength(str, 6) && ckUti.checkStrNumber(str)) {
      const y = Number(str.substring(0, 4))
      const m = Number(str.substring(4, 6))
      if ((2000 <= y && y <= 2099) && (1 <= m && m <= 12)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

// 日付文字(フォーム)チェックして日付オブジェクト取得
// true:日付オブジェクト false:null
const checkDateStrToDate = (str) => {
  try {
    if (ckUti.checkStr(str)) {
      if (!str.match(/^\d{4}\-\d{2}\-\d{2}$/)) {
        return null
      }
      const y = Number(str.split("-")[0])
      const m = Number(str.split("-")[1]) - 1
      const d = Number(str.split("-")[2])
      const date = new Date(y, m, d)
      if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
        return null
      }
      
      return date
    } else {
      return null
    }
  } catch {
    return null
  }
}

// ymd(yyyymmddの数値)文字をチェックして日付オブジェクト取得
// true:日付オブジェクト false:null
const checkYmdStrToDate = (str) => {
  try {
    if (ckUti.checkStr(str)) {
      if (!str.match(/^\d{8}$/)) {
        return null
      }
      const y = Number(str.substring(0, 4))
      const m = Number(str.substring(4, 6)) - 1
      const d = Number(str.substring(6, 8))
      const date = new Date(y, m, d)
      if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
        return null
      }

      return date
    } else {
      return null
    }
  } catch {
    return null
  }
}

// ym(yyyymmの数値)に月加算
const addYm = (ym, addMonth) => {
  const dt = getYmToDate(ym)
  dt.setMonth(dt.getMonth() + addMonth)

  return getDateToYm(dt)
}

// ymd(yyyymmddの数値)に日加算
const addYmd = (ymd, addDay) => {
  const dt = getYmdToDate(ymd)
  dt.setDate(dt.getDate() + addDay)

  return getDateToYmd(dt)
}

//#endregion
/*--------------------------------------------------*/

exports.isInvalidDate = isInvalidDate
exports.getNowUtime = getNowUtime
exports.getTimeToUtime = getTimeToUtime
exports.getUtimeToTime = getUtimeToTime
exports.getElapsedTimeStr = getElapsedTimeStr
exports.getIsoToDate = getIsoToDate
exports.getIsoToUtime = getIsoToUtime
exports.getDateToUtime = getDateToUtime
exports.getDateToYm = getDateToYm
exports.getDateToYmd = getDateToYmd
exports.getDateToIso = getDateToIso
exports.getDateToYearMonthDateStr = getDateToYearMonthDateStr
exports.getDateToYearMonthDateTimeStr = getDateToYearMonthDateTimeStr
exports.getDateToMonthDateTimeStr = getDateToMonthDateTimeStr
exports.getDateToWeekStr = getDateToWeekStr
exports.getDateToYearMonthDateJpnStr = getDateToYearMonthDateJpnStr
exports.getDateToYearMonthJpnStr = getDateToYearMonthJpnStr
exports.getDateToMonthDateJpnStr = getDateToMonthDateJpnStr
exports.getUtimeToMonthDateStr = getUtimeToMonthDateStr
exports.getUtimeToTimeStr = getUtimeToTimeStr
exports.getUtimeToDate = getUtimeToDate
exports.getUtimeToYmd = getUtimeToYmd
exports.getUtimeToYearMonthDateTimeStr = getUtimeToYearMonthDateTimeStr
exports.getUtimeToMonthDateTimeStr = getUtimeToMonthDateTimeStr
exports.getUtimeToYearMonthDateJpnStr = getUtimeToYearMonthDateJpnStr
exports.getUtimeToMonthDateTimeJpnStr = getUtimeToMonthDateTimeJpnStr
exports.getYmToDate = getYmToDate
exports.getYmdToDate = getYmdToDate
exports.getSecToTimeStr = getSecToTimeStr
exports.checkSameDate = checkSameDate
exports.checkYmStr = checkYmStr
exports.checkDateStrToDate = checkDateStrToDate
exports.checkYmdStrToDate = checkYmdStrToDate
exports.addYm = addYm
exports.addYmd = addYmd
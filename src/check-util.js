const cmn = require('./common')
// スキーマ
const Objects = require('./schema/objects')

// 文字数
const runes = require('runes')

// booleanチェック
const checkBoolean = (bool) => {
  if ((bool !== null && bool !== undefined) && typeof bool === 'boolean') {
    return true
  } else {
    return false
  }
}

// 数字チェック
const checkNumber = (num) => {
  if ((num !== null && num !== undefined) && typeof num === 'number') {
    let i = parseInt(num)
    if (isNaN(i)) return false
    return true
  } else {
    return false
  }
}

// 文字が数字チェック
const checkStrNumber = (str) => {
  if (checkStr(str)) {
    let i = parseInt(str)
    if (isNaN(i)) return false
    return true
  } else {
    return false
  }
}

// Keyチェック
const checkKey = (str) => {
  if (checkStr(str)) {
    if (str.length === 8) return true
  }
  return false
}

// IDチェック
const checkId = (str) => {
  if (checkStr(str)) {
    if (str.length <= 24) return true
  }
  return false
}

// ObjectIDチェック
const checkObjectId = (str) => {
  if (checkStr(str)) {
    const ObjectId = require('mongoose').Types.ObjectId
    if (ObjectId.isValid(str)) return true
  }
  return false
}

// 文字チェック
const checkStr = (str) => {
  if (str && typeof str === 'string' && str.trim()) return true
  return false
}

// 文字数チェック
const checkStrLength = (str, length) => {
  if (checkStr(str)) {
    const strAry = runes(str)
    if (strAry.length <= length) return true
  }
  return false
}

// 公開IDチェック
const checkPid = (str) => {
  // 半角英数字と_のみ6文字以上24文字以内
  if (checkStr(str) && str.match(/^[a-z0-9_]{6,24}$/)) {
    return true
  }
  return false
}

// NG公開IDチェック
const checkNgPid = (str) => {
  // 禁止文字チェック
  const checkStr = str.toLowerCase()
  if (
    checkStr === 'forgotpassword' ||
    checkStr === 'forgot_password' ||
    checkStr === 'resetpassword' ||
    checkStr === 'reset_password' ||
    checkStr === 'group' ||
    checkStr === 'join' || 
    checkStr === 'login' ||
    checkStr === 'notfound' ||
    checkStr === 'not_found' ||
    checkStr === 'signup' || 
    checkStr === 'support' || 
    checkStr === 'search' || 
    checkStr === 'user' || 
    checkStr === 'group_by' || 
    checkStr === cmn.SYSTEM_PGID
  ) {
    return false
  }

  return true
}

// メールチェック
const checkMail = (str) => {
  // 100文字以内、メール形式
  if (checkStr(str) && str.length <= 100 && str.match(/^[A-Za-z0-9]{1}[A-Za-z0-9_.-]*@{1}[A-Za-z0-9_.-]{1,}\.[A-Za-z0-9]{1,}$/)) return true
  return false
}

// パスワードチェック
const checkPassword = (str) => {
  // 半角英数字と_のみ6文字以上20文字以内チェック
  //////////////////////////
  //////////////////////////
  // 本当は6文字以上、テストで今は3文字以上に TODO
  //////////////////////////
  //////////////////////////
  if (checkStr(str) && str.match(/^\w{3,20}$/)) return true
  return false
}

// グループ管理者チェック
const checkGroupAdmin = async (_group) => {
  try {
    // グループオブジェクト取得
    const checkGroupObject = await Objects.findOne({ gid:_group.gid, oid:_group.goid }).select('members')
    if (checkGroupObject) {
      const member = checkGroupObject.members.find(o => o.oid === _group.moid)
      if (member && member.role === cmn.ADMIN_ROLE) {
        return true
      }
    }
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }

  return false
}

// オブジェクト管理者チェック
const checkObjectAdmin = async (_group, object) => {
  try {
    if (object.type === cmn.MEMBER_OTYPE) { // メンバー
      if (object.oid === _group.moid) {
        return true 
      }
    } else if (object.type === cmn.SUBGROUP_OTYPE) { // サブグループ
      const member = object.members.find(m => m.oid === _group.moid)
      if (member) {
        if (member.role === cmn.ADMIN_ROLE) { // サブグループ管理者
          return true 
        } 
      }
    } else if (object.type === cmn.TOPIC_OTYPE) { // 話題
      const checkParentObject = await Objects.findOne({ gid:_group.gid, 'items.oid':object.oid }).select('type members')
      if (checkParentObject) {
        const member = checkParentObject.members.find(m => m.oid === _group.moid)
        if (member && member.role === cmn.ADMIN_ROLE) { // オブジェクトグループ管理者チェック
          return true
        }
      }
    }
  } catch(err) {
    // エラーログ書き込み
    cmn.writeErrorlog(null, null, err)
  }
  
  return false
}

// 取得オブジェクトタイプチェック
const checkGetObjectType = (type) => {
  if (
    type === cmn.GGROUP_OTYPE ||
    type === cmn.HGROUP_OTYPE ||
    type === cmn.SUBGROUP_OTYPE ||
    type === cmn.MEMBER_OTYPE ||
    type === cmn.TOPIC_OTYPE
  ) {
    return true
  } else {
    return false
  }
}

// テキストオブジェクトタイプチェック(テキスト使えるオブジェクトタイプチェック)
const checkTextObjectType = (type) => {
  if (
    type === cmn.GGROUP_OTYPE ||
    type === cmn.HGROUP_OTYPE ||
    type === cmn.SUBGROUP_OTYPE ||
    type === cmn.MEMBER_OTYPE ||
    type === cmn.TOPIC_OTYPE ||
    type === cmn.FILE_OTYPE ||
    type === cmn.LINK_OTYPE
  ) {
    return true
  } else {
    return false
  }
}

// JSONのエラーチェック
const checkJsonError = (json) => {
  if (Object.keys(json).length === 2 && json.code === 200 && Object.keys(json.errors).length === 0)
    return true
  else
    return false
}

exports.checkBoolean = checkBoolean
exports.checkNumber = checkNumber
exports.checkStrNumber = checkStrNumber
exports.checkKey = checkKey
exports.checkId = checkId
exports.checkObjectId = checkObjectId
exports.checkStr = checkStr
exports.checkStrLength = checkStrLength
exports.checkPid = checkPid
exports.checkNgPid = checkNgPid
exports.checkMail = checkMail
exports.checkPassword = checkPassword
exports.checkGroupAdmin = checkGroupAdmin
exports.checkObjectAdmin = checkObjectAdmin
exports.checkGetObjectType = checkGetObjectType
exports.checkTextObjectType = checkTextObjectType
exports.checkJsonError = checkJsonError
const cmn = require('./common')
const cache = require('./cache') 
const ckUti = require('./check-util')
const flUti = require('./file-util')
const dtUti = require('./datetime-util')

// トークン
const Tokens = require("csrf")
const tokens = new Tokens()

// スキーマ
const Groups = require('./schema/groups')
const Members = require('./schema/members')
const Addmembers = require('./schema/addmembers')
const Objects = require('./schema/objects')
const Stars = require('./schema/stars')
const Messages = require('./schema/messages')
const Comments = require('./schema/comments')
const Schedules = require('./schema/schedules')

/*--------------------------------------------------*/

// 公開ID生成
const generatePid = async (session) => {  
  let pid
  while (true) {
    pid = cmn.generateOneId8()
    const checkGroup = await Groups.findOne({ pgid:pid }).select('_id').session(session)
    const checkMember = await Members.findOne({ pmid:pid }).select('_id').session(session)
    if (!checkGroup && !checkMember) {
      break
    }
    const err = new Error(`invalid gererate OneID8:${pid}`)
    cmn.writeErrorlog(null, null, err)
  }
  return pid
}

// グループの関連oid配列取得
const getGroupOidArray = async (req, gid, _group) => {
  
  const oidArray = []

  if (_group && _group.gid === gid) {
    // 所属オブジェクト取得
    const checkObjects = await Objects.find({ gid:gid, 'members.oid': { $in: _group.moid } }).select('oid')
    if (checkObjects) {
      // 所属オブジェクトoid追加
      checkObjects.map(o => oidArray.push(o.oid))
      // goid追加
      if (oidArray.indexOf(_group.goid) === -1) oidArray.push(_group.goid)
      // moid追加
      if (oidArray.indexOf(_group.moid) === -1) oidArray.push(_group.moid)
    }
  } else {
    // 公開グループチェック
    // キャッシュからグループ取得
    const cacheGroup = await cache.getGroup(gid)
    if (cacheGroup && (cmn.checkAdminAccount(req) || cacheGroup.pub)) { // 管理アカウント、公開中
      oidArray.push(cacheGroup.goid)
    }
  }
  if (oidArray.length > 0)
    return oidArray
  else 
    throw new Error("can't get oid's array of group")
}

// ログインセッションセット
const setLoginSession = async (req, res, account) => {
  
  const _account = {
    aid: account.aid,
    mail: account.mail,
    //password: account.password,
    name: account.name,
    //birthday: account.birthday,
    settings: account.settings,
    dgid: account.dgid,
    //amode: account.amode,
    //ctime: account.ctime,
    utime: account.utime,
    sgid: account.dgid,
    groups: [],
  }

  const gidArray = []  // gid配列
  const goidArray = [] // goid配列
  const midArray = [] // mid配列
  const moidArray = [] // moid配列
  for (let accountGroup of account.groups) {
    gidArray.push(accountGroup.gid)
    goidArray.push(accountGroup.goid)
    midArray.push(accountGroup.mid)
    moidArray.push(accountGroup.moid)
  }
  // グループ取得
  const checkGroups = await Groups.find({ gid:{ $in:gidArray } }).select('gid ooid pgid mode name')
  // グループオブジェクト取得
  const checkGroupObjects = await Objects.find({ oid:{ $in:goidArray } }).select('oid status members icon name')
  // メンバー取得
  const checkMembers = await Members.find({ mid:{ $in:midArray } }).select('mid pmid')
  // メンバーオブジェクト取得
  const checkMemberObjects = await Objects.find({ oid:{ $in:moidArray } }).select('oid status icon name')
  
  for (let accountGroup of account.groups) {

    // グループ取得
    const group = (checkGroups) ? checkGroups.find(g => g.gid === accountGroup.gid) : null
    if (!group) {
      continue
    }

    // グループオブジェクト取得
    const groupObject = (checkGroupObjects) ? checkGroupObjects.find(o => o.oid === accountGroup.goid) : null
    if (groupObject) {
      // グループ停止チェック
      if (groupObject.status === cmn.STOP_OSTATUS) {
        let isAdmin = false
        if (group.ooid === accountGroup.moid) { // グループオーナー
          isAdmin = true
        }
        const member = groupObject.members.find(o => o.oid === accountGroup.moid)
        if (member && member.role === cmn.ADMIN_ROLE) {
          isAdmin = true // グループ管理者
        }
        if (!isAdmin) {
          continue
        }
      }
    } else {
      continue // 削除されたグループ
    }

    // メンバー取得
    const member = (checkMembers) ? checkMembers.find(m => m.mid === accountGroup.mid) : null
    if (!member) {
      continue
    }

    // メンバーオブジェクト取得チェック
    const memberObject = (checkMemberObjects) ? checkMemberObjects.find(o => o.oid === accountGroup.moid) : null
    if (memberObject) {
      // メンバー停止チェック
      if (memberObject.status === cmn.STOP_OSTATUS) {
        continue
      }
    } else {
      continue // 削除されたメンバー
    }

    // マイグループならグループ名をセットしない
    const gname = (group.mode !== cmn.MYGROUP_GMODE) ? group.name : ''
    
    // アカウントグループ追加
    _account.groups.push({
      gid: accountGroup.gid,
      goid: accountGroup.goid,
      mid: accountGroup.mid,
      moid: accountGroup.moid,
      ooid: group.ooid,
      pgid: group.pgid,
      mode: group.mode,
      status: groupObject.status,
      gicon: groupObject.icon,
      gname: gname,
      pmid: member.pmid,
      icon: memberObject.icon,
      name: memberObject.name,
    }) 
  }

  // セッションアカウントクリア
  if ('account' in req.session) {
    delete req.session.account
  }
  // セッションアカウントセット
  req.session.account = _account

  // セッション管理者モードクリア
  if ('amode' in req.session) {
    delete req.session.amode
  }
  // セッションアカウントセット
  if ('amode' in account && account.amode === 1) {
    req.session.amode = 'admin'
  }
}

// アカウントグループ削除
const deleteAccountGroup = (req, gid) => {
  const index = req.session.account.groups.findIndex(g => g.gid === gid)
  if (index > -1) {
    // セッション更新
    req.session.account.groups.splice(index, 1)
    if (req.session.account.sgid === gid) req.session.account.sgid = req.session.account.dgid // 選択gidが削除gidにならデフォルトgidに変更
    req.session.account.utime = dtUti.getNowUtime()
  }
}

// トークンセット
const setToken = async (req, res) => {

  // トークンクリア
  clearToken(req, res)

  // 新規に秘密文字とトークンを生成
  const secret = await tokens.secret()
  const token = tokens.create(secret)
 
  // 秘密文字はセッションに保存
  req.session.csrfSecret = secret
  // トークンはクッキーに保存
  res.cookie("_token", token)

  return token
}

// トークンクリア
const clearToken = (req, res) => {
  delete req.session.csrfSecret
  res.clearCookie("_token")
}

// トークンチェック
const checkToken = (req, res) => {
  // BODYからトークン取得
  const _token = (req.body._token) ? req.body._token : ''
  // クッキーからトークン取得
  const token = req.cookies._token
  // セッションから秘密文字取得
  const secret = req.session.csrfSecret

  // トークンクリア
  clearToken(req, res)

  // チェック(Double Submit Cookie 及びトークンチェック)
  if (_token && token && secret && _token === token && tokens.verify(secret, token)) {
    return true
  } else {
    return false
  }
}

// JSON送信
const sendJSON = (res, json) => {
  // JSONのエラーチェック
  if (ckUti.checkJsonError(json))
    json.code = 500
  
  if (json.code === 400 && Object.keys(json.errors).length === 0)
    json.errors.result = '不正アクセス'
  
  if (json.code === 500 && Object.keys(json.errors).length === 0)
    json.errors.result = 'エラーが発生しました'
  
  if (json.code !== 200)
    res.status(json.code)

  if (Object.keys(json.errors).length === 0)
    delete json.errors
  
  // 送信
  res.json(json)
}

// ダイレクトメッセージポリシーチェック
const checkDirectMessagePolicy = async (json, member, _group) => {
  
  // 自分自身チェック
  if (member.moid === _group.moid) {
    json.code = 400
    throw new Error('invalid direct message')  
  }

  // このメンバーとはダイレクトメッセージできるかチェック
  let isCheck = false
  
  // ダイレクトメッセージ取得
  const checkMessages = await Messages.find({
    type:cmn.DM_MTYPE, 
    $or:[
      { 'objects.0':_group.moid, 'objects.1':member.moid },
      { 'objects.0':member.moid, 'objects.1':_group.moid }
    ]
  }).select('status objects')
  if (checkMessages && checkMessages.length === 1) { // 一度やりとりをした事があるかチェック
    if (checkMessages[0].status === cmn.NOMAL_MSTATSU) {
      isCheck = true
    }
  } else {
    if (member.gid === _group.gid) { // 同じグループ
      isCheck = true
    } else {
      if (member.dmmode === cmn.ALL_DMMODE) {
        isCheck = true
      } else if (member.dmmode === cmn.LIMITED_DMMODE) {
        // お気に入り取得
        const checkStars = await Stars.find({ gid:member.gid, moid:member.moid, tgid:_group.gid, toid:_group.moid }).select('_id')
        if (checkStars && checkStars.length === 1) {
          isCheck = true
        }
      }
    }
  }
  
  return isCheck
}

// ログインチェック
const checkLogin = (req, res) => {
  if (req.session.account) {

    if (req.method === 'POST') {
      // トークンチェック
      if (checkToken(req, res)) {
        return true
      } else {
        // 不正アクセス
        res.status(400)
        res.json({ code:400, error:{ result:'不正アクセス' } })
        return false
      }
    }

    return true
  } else {
    // 未認証
    res.status(401)
    res.json({ code:401, error:{ result:'ログインしていません'} })
    return false
  }
}

// aidチェック
const checkAid = (req, json, aid) => {
  
  // アカウント取得
  if (req.session.account && req.session.account.aid === aid) {
    return req.session.account
  }
  if (json) json.code = 400
  throw new Error('invalid aid')
}

// moidチェック
const checkMoid = async (json, moid, isReturn = true) => {
  
  const checkMember = await Members.findOne({ moid:moid }).select((isReturn) ? '-_id' : '_id')
  if (checkMember) {
    return checkMember
  }
  if (json) json.code = 400
  throw new Error('invalid moid')
}

// pmidチェック
const checkPmid = async (json, pmid, isReturn = true) => {
  
  const checkMember = await Members.findOne({ pmid:pmid }).select((isReturn) ? '-_id' : '_id')
  if (checkMember) {
    return checkMember
  }
  if (json) json.code = 400
  throw new Error('invalid pmid')
}

// オブジェクト情報取得
const getObjectInfo = async (req, json, _group, object, member) => {

  // テキストオブジェクトタイプチェック
  checkTextObjectType(json, object.type)
  
  // キャッシュからグループ取得
  const cacheGroup = await cache.getGroup(object.gid)
  if (!cacheGroup) {
    return null
  }

  let pub = cacheGroup.pub
  const accountGroup = cmn.getAccountGroup(req, object.gid)
  if (accountGroup) {
    pub = true // 所属グループの場合、表示できるので公開にする
  }
  if (!accountGroup && object.status === cmn.DELETE_OSTATUS) { // 所属では無く、状態が削除なら
    return null
  }

  const objectInfo = {
    gid: object.gid,
    pgid: cacheGroup.pgid,
    poid: '',
    oid: object.oid,
    pid: '',
    status: object.status,
    type: object.type,
    gname: cacheGroup.name,
    icon: object.icon,
    name: object.name,
    scount: object.scount,
    profile: object.data.get('profile'),
    pub: pub,
  }

  if (objectInfo.type === cmn.TOPIC_OTYPE) { // 話題
    // 親オブジェクト取得
    const checkObjects = await Objects.find({ gid:object.gid, 'items.oid':object.oid }).select('oid')
    for (let checkObject of checkObjects) {
      if (checkObject.oid !== cacheGroup.goid && checkObject.oid !== object.oid) {
        // 話題の親オブジェクトをセット
        objectInfo.poid = checkObject.oid
        break
      }
    }
  }

  // グループオブジェクト
  if (objectInfo.type === cmn.MGROUP_OTYPE || objectInfo.type === cmn.GGROUP_OTYPE || objectInfo.type === cmn.HGROUP_OTYPE) { 
    // 公開IDセット
    objectInfo.pid = cacheGroup.pgid
    // マイグループならグループ名をセットしない
    if (objectInfo.type === cmn.MGROUP_OTYPE) {
      objectInfo.gname = ''
    }
  }
  // メンバーオブジェクト
  if (objectInfo.type === cmn.MEMBER_OTYPE) {
    if (member) {
      // 公開IDセット
      objectInfo.pid = member.pmid 
    }
    // マイグループならグループ名をセットしない
    if (cacheGroup.mode === cmn.MYGROUP_GMODE) {
      objectInfo.gname = ''
    }
  }

  if (objectInfo.type === cmn.MEMBER_OTYPE && member && _group && member.moid !== _group.moid) { // メンバータイプでログイン中で自分以外
    // お気に入り取得
    const checkStar = await Stars.findOne({ gid:_group.gid, moid:_group.moid, tgid:object.gid, toid:object.oid }).select('_id')
    if (checkStar) {
      objectInfo.star = true
    } else {
      objectInfo.star = false
    }
  }

  return objectInfo
}

// グループとメンバーチェック(グループは所属か公開)
const checkGroupWithMember = async (req, json, sgid, moid) => {
  
  let _group = null

  if (moid) {
    _group = cmn.getAccountGroupMember(req, moid)
    if (_group) { // moidが所属
      if (_group.gid === sgid) { // メンバーがグループに所属の場合
        return _group
      }
    } else { // moidが所属ではない
      if (json) json.code = 400
      throw new Error('invalid moid with group')
    }
  }

  // キャッシュからグループ取得
  const cacheGroup = await cache.getGroup(sgid)
  if (cacheGroup && (cmn.checkAdminAccount(req) || cacheGroup.pub)) { // 管理アカウント、公開中
    return _group // グループが公開中なら所属の有無にかかわらず_groupを返す
  }
  
  if (json) json.code = 400
  throw new Error('invalid cache group')
}

// 所属グループチェック
const checkBelongGroup = (req, json, gid) => {
  
  // アカウントグループ取得
  const _group = cmn.getAccountGroup(req, gid)
  if (_group) {
    // 管理アカウントチェック
    cmn.checkAdminAccount(req) // 管理アカウントでPOSTはエラー

    return _group
  }
  if (json) json.code = 400
  throw new Error('invalid belong group')
}

// 所属メンバーチェック
const checkBelongMember = (req, json, moid) => {
  
  // アカウントグループメンバー取得
  const _group = cmn.getAccountGroupMember(req, moid)
  if (_group) {
    // 管理アカウントチェック
    cmn.checkAdminAccount(req) // 管理アカウントでPOSTはエラー

    return _group
  }
  if (json) json.code = 400
  throw new Error('invalid belong member')
}

// 公開グループチェック
const checkPublicGroup = async (json, gid) => {
  
  // キャッシュからグループ取得
  const cacheGroup = await cache.getGroup(gid)
  if (cacheGroup && (cmn.checkAdminAccount(req) || cacheGroup.pub)) { // 管理アカウント、公開中
    return cacheGroup
  }

  if (json) json.code = 400
  throw new Error('invalid public gid')
}

// グループ数チェック
const checkGroupCount = async (req, json) => {
  
  // 最大グループ数
  const maxgp = (req.session.account.settings.maxgp) ? req.session.account.settings.maxgp : cmn.MAX_GP
  
  // グループ数
  let count = 0
  for (let group of req.session.account.groups) {
    if (group.ooid === group.moid) {
      ++count
    }
  }
  
  // グループ数チェック
  if (maxgp <= count) {
    json.errors.result = `これ以上追加できません(最大${maxgp})`
    throw new Error('max group count over')
  }

  return true
}

// メンバー数チェック
const checkMemberCount = async (json, gid) => {
  
  // グループ取得
  const checkGroup = await Groups.findById(gid).select('settings')
  // メンバー取得
  const members = await Objects.find({ gid:gid, type:cmn.MEMBER_OTYPE }).select('oid')
  // 最大オメンバー数
  const maxmem = (checkGroup.settings.get('maxmem')) ? checkGroup.settings.get('maxmem') : cmn.MAX_MEM
  
  // メンバー数チェック
  if (maxmem <= members.length) {
    json.errors.result = `これ以上追加できません(最大${maxmem})`
    throw new Error('max member count over')
  }

  return true
}

// オブジェクト数チェック
const checkObjectCount = async (json, gid) => {
  
  // グループ取得
  const checkGroup = await Groups.findById(gid).select('settings')
  // オブジェクト取得
  const objects = await Objects.find({ gid:gid, $or:[{ type:cmn.SUBGROUP_OTYPE }, { type:cmn.TOPIC_OTYPE }] }).select('oid')
  // 最大オブジェクト数
  const maxobj = (checkGroup.settings.get('maxobj')) ? checkGroup.settings.get('maxobj') : cmn.MAX_OBJ
  
  // オブジェクト数チェック
  if (maxobj <= objects.length) {
    json.errors.result = `これ以上追加できません(最大${maxobj})`
    throw new Error('max object count over')
  }

  return true
}

// お気に入り登録者数チェック
const checkStarEntryCount = async (json, gid, moid) => {
  
  // グループ取得
  const checkGroup = await Groups.findById(gid).select('settings')
  // メンバー取得
  const member = await Members.findOne({ gid:gid, moid:moid }).select('scount')
  // 最大お気に入り数
  const maxstar = (checkGroup.settings.get('maxstar')) ? checkGroup.settings.get('maxstar') : cmn.MAX_MEM
  
  // お気に入り登録者数チェック
  if (maxstar <= member.scount + 1) {
    json.errors.result = `これ以上追加できません(最大${maxstar})`
    throw new Error('max star count over')
  }

  return true
}

// グループファイルサイズチェック
const checkGroupFilesize = async (json, gid, addSize) => {
  
  if (addSize > 0) {
    // グループ取得
    const checkGroup = await Groups.findById(gid).select('settings')

    let filesize = (checkGroup.settings.get('filesize')) ? checkGroup.settings.get('filesize') : 0
    filesize = filesize + addSize

    // ファイル容量チェック
    const filecapa = (checkGroup.settings.get('filecapa')) ? checkGroup.settings.get('filecapa') : cmn.FILE_CAPA
    if (filecapa <= filesize) {
      json.errors.result = `ファイル容量がオーバーしています(最大${cmn.viewShortFilesize(filecapa)})`
      throw new Error('file size exceeded')
    }
  }
  return true
}

// amidチェック(メンバー)
const checkAmid = async (json, amid, isReturn = true) => {
  
  const checkAddmember = await Addmembers.findById(amid).select((isReturn) ? '-_id' : '_id')
  if (checkAddmember) {
    return checkAddmember
  }
  if (json) json.code = 400
  throw new Error('invalid amid')
}

// グループ管理者チェック
const checkGroupAdmin = async (json, _group) => {
  
  // グループ管理者チェック
  const isGroupAdmin = await ckUti.checkGroupAdmin(_group)
  if (isGroupAdmin) {
    return true
  }
  if (json) json.code = 400
  throw new Error('invalid group admin')
}

// オブジェクト管理者チェック
const checkObjectAdmin = async (json, _group, object) => {
  
  // グループ管理者チェック
  if (await ckUti.checkGroupAdmin(_group)) return true
  // オブジェクト管理者チェック
  if (await ckUti.checkObjectAdmin(_group, object)) return true

  if (json) json.code = 400
  throw new Error('invalid object admin')
}

// オブジェクトスケジュール作成チェック
const checkObjectScheduleCreate = (json, _group, object) => {

  if (object.type === cmn.MEMBER_OTYPE) { // メンバー
    if (object.oid === _group.moid) {
      return true 
    }
  }  else { // メンバー以外
    return true
  }

  if (json) json.code = 400
  throw new Error('invalid object schedule create')
}

// スケジュール編集チェック
const checkScheduleEdit = async (json, _group, object, schedule) => {

  // スケジュールのオブジェクトが同じかチェック
  if (schedule.oid !== object.oid) { 
    json.code = 400
    throw new Error('invalid schedule oid')
  }

  // 取り込み
  const isIn = (schedule.type === cmn.INSCHEDULE_STYPE) ? true : false 
  // オブジェクト管理者チェック
  const isAdmin = await ckUti.checkObjectAdmin(_group, object)

  if (!isIn && (isAdmin || schedule.wmoid === _group.moid)) { // 取り込みで無い、オブジェクト管理者 or 作成者が自分
    return true
  }

  if (json) json.code = 400
  throw new Error('invalid schedule edit')
}

// gidチェック
const checkGid = async (json, gid, isReturn = true) => {
  
  const checkGroup = await Groups.findById(gid).select((isReturn) ? '-_id' : '_id')
  if (checkGroup) {
    return checkGroup
  }
  if (json) json.code = 400
  throw new Error('invalid gid')
}

// oidチェック
const checkOid = async (json, gid, oid, isReturn = true) => {
  
  if (gid) {
    const checkObject = await Objects.findOne({ gid:gid, oid:oid }).select((isReturn) ? '-_id' : '_id')
    if (checkObject) {
      return checkObject
    }
  } else {
    const checkObject = await Objects.findById(oid).select((isReturn) ? '-_id' : '_id')
    if (checkObject) {
      return checkObject
    }
  }
  if (json) json.code = 400
  throw new Error('invalid oid')
}

// oidArrayチェック
const checkOidArray = async (json, gid, oidArray) => {
  
  if (oidArray && Array.isArray(oidArray) && oidArray.length > 0) {
    // 一意の配列に変換
    const oidSet = new Set()
    oidArray.map(oid => oidSet.add(oid))
    const _oidArray = Array.from(oidSet)
    
    const isCheck = true
    for (let oid of _oidArray) {
      // ObjectIdチェック
      if (ckUti.checkObjectId(oid) === false) {
        isCheck = false
        break
      }
    }
    if (isCheck) {
      const checkObjects = await Objects.find({ gid:gid, oid:{ $in: _oidArray } }).select('oid')
      if (checkObjects && checkObjects.length === _oidArray.length) {
        return true
      }
    }
  }
  if (json) json.code = 400
  throw new Error("invalid oid's array")
}

// 取得オブジェクトタイプチェック
const checkGetObjectType = (json, type) => {
  if (ckUti.checkGetObjectType(type)) {
    return true
  }
  json.code = 400
  throw new Error('invalid object type')
}

// テキストオブジェクトタイプチェック(テキスト使えるオブジェクトタイプチェック)
const checkTextObjectType = (json, type) => {
  if (ckUti.checkTextObjectType(type)) {
    return true
  }
  json.code = 400
  throw new Error('invalid object type')
}

// midチェック
const checkMid = async (json, mid, isReturn = true, plusField = '') => {
  
  const checkMessage = await Messages.findById(mid).select((isReturn) ? `gid mkey type wgid wmoid members objects${(plusField) ? ` ${plusField}` : ''}` : '_id')
  if (checkMessage) {
    return checkMessage
  }
  if (json) json.code = 400
  throw new Error('invalid mid')
}

// メッセージ表示チェック
const checkMessageView = async (req, json, message, _group) => {
  
  if (message.type === cmn.MESSAGE_MTYPE) {
    if (_group && message.wgid === _group.gid && message.wmoid === _group.moid) return true

    // グループ関連oid配列取得
    const groupOidArray = await getGroupOidArray(req, message.gid, _group)
    if (groupOidArray) {
      // 関連アカウントチェック
      isExist = false
      for (let oid of groupOidArray) {
        if (message.members.indexOf(oid) !== -1) {
          isExist = true
          break
        }
      }
      if (isExist) return true
    }
  }

  if (json) json.code = 400
  throw new Error("invalid message view")
}

// ダイレクトメッセージ表示チェック
const checkDirectMessageView = (json, message, moid, dmoid) => {
  
  if (
    (message.type === cmn.DM_MTYPE) &&
    (moid !== dmoid) &&
    (message.objects.length === 2) &&
    (moid && message.objects.includes(moid)) &&
    (dmoid && message.objects.includes(dmoid))
  ) {
    return true
  }

  if (json) json.code = 400
  throw new Error("invalid direct message view")
}

// メッセージ作成者チェック
const checkMessageAuthor = (json, message, _group) => {
  
  if (message.wgid === _group.gid && message.wmoid === _group.moid) {
    return true
  }
  if (json) json.code = 400
  throw new Error("invalid message author")
}

// cidチェック
const checkCid = async (json, cid, isReturn = true) => {
  
  const checkComment = await Comments.findById(cid).select((isReturn) ? '-_id' : '_id')
  if (checkComment) {
    return checkComment
  }
  if (json) json.code = 400
  throw new Error('invalid cid')
}

// sidチェック
const checkSid = async (json, sid, isReturn = true) => {
  
  const checkSchedule = await Schedules.findById(sid).select((isReturn) ? `gid sid oid wgid wmoid type members` : '_id')
  if (checkSchedule) {
    return checkSchedule
  }
  if (json) json.code = 400
  throw new Error('invalid sid')
}

// スケジュール表示チェック
const checkScheduleView = async (req, json, schedule, _group) => {
  
  if (_group && schedule.wgid === _group.gid && schedule.wmoid === _group.moid) return true

  // グループ関連oid配列取得
  const groupOidArray = await getGroupOidArray(req, schedule.gid, _group)
  if (groupOidArray) {
    // 関連アカウントチェック
    isExist = false
    for (let oid of groupOidArray) {
      if (schedule.members.indexOf(oid) !== -1) {
        isExist = true
        break
      }
    }
    if (isExist) return true
  }

  if (json) json.code = 400
  throw new Error("invalid schedule view")
}

// pidチェック
const checkPid = (json, pid) => {
  
  // 公開IDチェック
  if (ckUti.checkPid(pid)) {
    return true
  }
  if (json) json.code = 400
  throw new Error('invalid pid')
}

// NGpidチェック
const checkNgPid = (json, pid) => {
  
  // NG公開IDチェック
  if (ckUti.checkNgPid(pid)) {
    return true
  }
  if (json) json.code = 400
  throw new Error('invalid pid')
}

// パスワードチェック
const checkPassword = (json, password, name) => {
  
  // パスワードチェック
  if (ckUti.checkPassword(password)) {
    return true
  }
  if (json) json.code = 400
  throw new Error(`invalid ${name}`)
}

// メールアドレスチェック
const checkMail = (json, mail) => {
  
  // メールアドレスチェック
  if (ckUti.checkMail(mail)) {
    return true
  }
  if (json) json.code = 400
  throw new Error('invalid mail')
}

// 生年月日チェック
const checkBirthday = (json, birthday) => {
  
  // 日付文字有効チェック
  const date = dtUti.checkDateStrToDate(birthday)
  if (date) {
    // 範囲チェック
    const nowDate = new Date()
    let minDate = new Date(nowDate.getFullYear() - 128, nowDate.getMonth() , nowDate.getDate())
    let maxDate = new Date(nowDate.getFullYear(), nowDate.getMonth() , nowDate.getDate())
    if (minDate <= date && date <= maxDate) {
      return true
    }
  }
  if (json) json.code = 400
  throw new Error('invalid birthday')
}

// ファイル名チェック
const checkFilename = (json, value, name) => {
  
  // 文字、ファイル名チェック
  if (ckUti.checkStr(value) && flUti.checkFilename(value)) {
    return true
  }
  if (json) json.code = 400
  throw new Error(`invalid ${name}`)
}

// パスチェック
const checkPath = (json, value, name) => {
  
  // 文字、パスチェック
  if (ckUti.checkStr(value) && flUti.checkPath(value)) {
    return true
  }
  if (json) json.code = 400
  throw new Error(`invalid ${name}`)
}

// 画像チェック
const checkImage = (json, file) => {
  
  // 画像チェック
  if (flUti.checkImage(file)) {
    return true
  }
  if (json) json.code = 400
  throw new Error('invalid image')
}

// 動画チェック
const checkVideo = (json, file) => {
  
  // 動画チェック
  if (flUti.checkVideo(file)) {
    return true
  }
  if (json) json.code = 400
  throw new Error('invalid video')
}

// 文字文字数チェック
const checkStrLength = (json, value, length, name) => {
  
  // 文字数チェック
  if (ckUti.checkStrLength(value, length)) {
    return true
  }
  if (json) json.code = 400
  throw new Error(`invalid ${name}`)
}

// YMD文字チェック
const checkYmdStr = (json, value) => {
  
  // 文字が数字チェック
  if (ckUti.checkStrNumber(value)) {
    // YMD文字有効チェック
    const date = dtUti.checkYmdStrToDate(value)
    if (date) {
      return date
    } 
  }
  if (json) json.code = 400
  throw new Error('invalid ymd str')
}

// UNIXタイムチェック
const checkUtime = (json, value) => {
  
  // UNIXタイムからDateオブジェクトを取得
  const date = dtUti.getUtimeToDate(value)
  if (date) {
    return date
  }
  if (json) json.code = 400
  throw new Error('invalid utime')
}

/*--------------------------------------------------*/

exports.generatePid = generatePid
exports.getGroupOidArray = getGroupOidArray
exports.setLoginSession = setLoginSession
exports.deleteAccountGroup = deleteAccountGroup
exports.setToken = setToken
exports.sendJSON = sendJSON
exports.checkDirectMessagePolicy = checkDirectMessagePolicy
exports.checkLogin = checkLogin
exports.checkAid = checkAid
exports.checkMoid = checkMoid
exports.checkPmid = checkPmid
exports.getObjectInfo = getObjectInfo
exports.checkGroupWithMember = checkGroupWithMember
exports.checkBelongGroup = checkBelongGroup
exports.checkBelongMember = checkBelongMember
exports.checkPublicGroup = checkPublicGroup
exports.checkGroupCount = checkGroupCount
exports.checkMemberCount = checkMemberCount
exports.checkObjectCount = checkObjectCount
exports.checkStarEntryCount = checkStarEntryCount
exports.checkGroupFilesize = checkGroupFilesize
exports.checkAmid = checkAmid
exports.checkGroupAdmin = checkGroupAdmin
exports.checkObjectAdmin = checkObjectAdmin
exports.checkObjectScheduleCreate = checkObjectScheduleCreate
exports.checkScheduleEdit = checkScheduleEdit
exports.checkGid = checkGid
exports.checkOid = checkOid
exports.checkOidArray = checkOidArray
exports.checkGetObjectType = checkGetObjectType
exports.checkTextObjectType = checkTextObjectType
exports.checkMid = checkMid
exports.checkMessageView = checkMessageView
exports.checkDirectMessageView = checkDirectMessageView
exports.checkMessageAuthor = checkMessageAuthor
exports.checkSid = checkSid
exports.checkScheduleView = checkScheduleView
exports.checkCid = checkCid
exports.checkPid = checkPid
exports.checkNgPid = checkNgPid
exports.checkPassword = checkPassword
exports.checkMail = checkMail
exports.checkBirthday = checkBirthday
exports.checkFilename = checkFilename
exports.checkPath = checkPath
exports.checkImage = checkImage
exports.checkVideo = checkVideo
exports.checkStrLength = checkStrLength
exports.checkYmdStr = checkYmdStr
exports.checkUtime = checkUtime
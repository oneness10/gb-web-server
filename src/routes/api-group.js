const cmn = require('../common')
const cache = require('../cache') 
const apUti = require('../api-util')
const ckUti = require('../check-util')
const dtUti = require('../datetime-util')
const gpUti = require('../group-util')
const mlUti = require('../mail-util')
const dbUti = require('../db-util')
const flUti = require('../file-util')
const obUti = require('../object-util')

const express = require('express')
const router = express.Router()

// MongoDB
const mongoose = require('mongoose')
const db = mongoose.connection

// スキーマ
const Accounts = require('../schema/accounts')
const Groups = require('../schema/groups')
const Members = require('../schema/members')
const Addmembers = require('../schema/addmembers')
const Objects = require('../schema/objects')
const Stars = require('../schema/stars')
const Messages = require('../schema/messages')

/*--------------------------------------------------*/
//#region GET

// お気に入り結合取得(登録されている)
const _getPassiveStarLookup = (_group) => {
  return {
    $lookup: {
      from: 'stars',
      let: {
        local_gid:'$gid',
        local_moid:'$moid',
      },
      pipeline: [
        {
          $match: {
            gid: _group.gid,
            moid: _group.moid,
            $expr: {
              $and: [
                { $eq: ['$$local_gid', '$tgid'] },
                { $eq: ['$$local_moid', '$toid'] },
              ]
            },
          }
        },
        { $project: { _id:0 } }
      ],
      as: 'rsub',
    }
  }
}

// アカウントグループチェック
const checkAccountGroup = async (req, _group) => {

  if (!_group) return false

  try {
    // グループ取得
    const cacheGroup = await cache.getGroup(_group.gid)
    if (!cacheGroup) {
      throw new Error('not found group')
    }

    // グループオブジェクト取得
    const groupObject = await Objects.findById(_group.goid).select('status members')
    if (groupObject) {
      // グループ停止チェック
      if (groupObject.status === cmn.STOP_OSTATUS) {
        let isAdmin = false
        if (cacheGroup.ooid === _group.moid) { // グループオーナー
          isAdmin = true
        }
        const member = groupObject.members.find(o => o.oid === _group.moid)
        if (member && member.role === cmn.ADMIN_ROLE) {
          isAdmin = true // グループ管理者
        }
        if (!isAdmin) {
          throw new Error('invalid group admin')
        }
      }
    } else {
      throw new Error('not found group object')
    }

    // メンバー取得
    const member = await Members.findById(_group.mid).select('_id')
    if (!member) {
      throw new Error('not found member')
    }

    // メンバーオブジェクト取得チェック
    const memberObject = await Objects.findById(_group.moid).select('status')
    if (memberObject) {
      // メンバー停止チェック
      if (memberObject.status === cmn.STOP_OSTATUS) {
        throw new Error('invalid member stop')
      }
    } else {
      throw new Error('not found member object')
    }
  } catch {
    // アカウントグループ削除
    apUti.deleteAccountGroup(req, _group.gid)
    return false
  }
  return true
}

/*--------------------------------------------------*/

// グループ取得(idは所属はgid、所属外はpgid)
router.get('/:id', function(req, res, next) {
  
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const id = ckUti.checkId(req.params.id) ? req.params.id : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!id) {
        json.code = 400
        throw new Error('invalid get')
      }

      let checkGroup = null
      const select = 'gid goid ooid pgid mode status pub name settings'

      // アカウントグループ取得
      let _group = cmn.getAccountGroup(req, id)
      // アカウントグループチェック
      if (!await checkAccountGroup(req, _group)) _group = null

      if (_group) {
        // 所属グループ

        // グループ取得
        checkGroup = await Groups.findById(id).select(select) // idはgid
        if (!checkGroup) { // グループが見つからない
          json.code = 404
          throw new Error('not found group')
        }
      } else {
        // 外部グループ(所属していない)

        // グループ取得
        checkGroup = await Groups.findOne({ pgid:id }).select(select) // idはpgid
        if (!checkGroup) { // グループが見つからない
          json.code = 404
          throw new Error('not found group')
        }
        if (!cmn.checkAdminAccount(req) && !checkGroup.pub) { // 管理アカウント以外、非公開
          json.code = 404
          throw new Error('not found group')
        }
      }

      /*--------------------------------------------------*/

      // グループ全てのオブジェクト取得
      const objects = await Objects.find({ gid:checkGroup.gid }).select('-gid -messages -ctime')
      // グループオブジェクト取得
      const groupObject = objects.find(o => o.oid == checkGroup.goid)
      // pgidセット
      groupObject._doc.pgid = checkGroup.pgid // グループオブジェクトにpgid追加(列を追加するには_docに追加)
      
      // メンバー削除チェック
      for (let i = objects.length - 1; i >= 0; i--) {
        let object = objects[i]
        if (object.type === cmn.MEMBER_OTYPE && object.status === cmn.DELETE_OSTATUS) { // 状態が削除なら
          if (!_group) { // 所属では無いなら
            objects.splice(i , 1) // 削除
            // グループの対象メンバー削除
            const index = groupObject.members.findIndex(m => m.oid === object.oid)
            if (index > -1) groupObject.members.splice(index, 1)
            // サブグループの対象メンバー削除
            for (let obj of objects) {
              if (obj.type === cmn.SUBGROUP_OTYPE) {
                const membersIndex = obj.members.findIndex(m => m.oid === object.oid)
                if (membersIndex > -1) obj.members.splice(membersIndex, 1)
                const itemsIndex = obj.items.findIndex(i => i.oid === object.oid)
                if (itemsIndex > -1) obj.items.splice(membersIndex, 1)
              }
            }
          }
        }
      }
      
      // メンバー取得
      const checkMembers = await Members.find({ gid:checkGroup.gid }).select('moid pmid')
      for (let checkMember of checkMembers) {
        // メンバーオブジェクト取得
        const memberObject = objects.find(o => o.oid == checkMember.moid)
        if (memberObject) {
          memberObject._doc.pmid = checkMember.pmid // メンバーオブジェクトにpmid追加(列を追加するには_docに追加)
        }
      }
      // resオブジェクトセット
      await obUti.setResObject(objects)

      const settings = {}
      if (checkGroup.settings.get('color1')) settings.color1 = checkGroup.settings.get('color1')
      if (checkGroup.settings.get('color2')) settings.color2 = checkGroup.settings.get('color2')
      if (checkGroup.settings.get('color3')) settings.color3 = checkGroup.settings.get('color3')
      if (checkGroup.settings.get('color4')) settings.color4 = checkGroup.settings.get('color4')
      if (checkGroup.settings.get('color5')) settings.color5 = checkGroup.settings.get('color5')

      // グループセット
      json.group = {
        gid: checkGroup.gid,
        goid: checkGroup.goid,
        ooid: checkGroup.ooid,
        pgid: checkGroup.pgid,
        mode: checkGroup.mode,
        status: checkGroup.status,
        pub: checkGroup.pub,
        settings: settings,
        name: checkGroup.name,
        objects: [...objects],
      }
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, json, err)
    } finally {
      // JSON送信
      apUti.sendJSON(res, json)
    }
  }

  doAsync(req, res)
})

// メンバー取得
router.get('/member/:sgid', function(req, res, next) {
    
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.params.sgid) ? req.params.sgid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sgid) {
        json.code = 400
        throw new Error('invalid get')
      }

      // キャッシュからグループ取得
      const cacheGroup = await cache.getGroup(sgid)
      if (!cacheGroup) {
        json.code = 404
        throw new Error('not found group')
      }

      let _group = null

      if (cacheGroup.pub) {
        // 公開グループ

        if (req.session.account) { // ログイン
          _group = cmn.getAccountGroup(req, req.session.account.sgid) // 選択gidチェック
          if (!await checkAccountGroup(req, _group)) _group = null // アカウントグループチェック
          if (!_group) {
            _group = cmn.getAccountGroup(req, sgid) // 所属gidチェック
            if (!await checkAccountGroup(req, _group)) _group = null // アカウントグループチェック
            if (!_group) {
              _group = cmn.getAccountGroup(req, req.session.account.dgid) // デフォルトsgidチェック
              if (!await checkAccountGroup(req, _group)) _group = null // アカウントグループチェック
            }
          }
        } else {
          // メンバーセット
          json.member = null
          return
        }
      } else {
        // 非公開グループ

        if (req.session.account) { // ログイン
          _group = cmn.getAccountGroup(req, sgid) // 選択gidチェック
          // アカウントグループチェック
          if (!await checkAccountGroup(req, _group)) _group = null
        }

        if (!_group) { // 所属ではない
          if (cmn.checkAdminAccount(req)) { // 管理アカウント
            _group = cmn.getAccountGroup(req, req.session.account.sgid) // 選択gidチェック
            // アカウントグループチェック
            if (!await checkAccountGroup(req, _group)) _group = null
          }
        }
      }

      if (!_group) { // 見つからない場合エラー
        throw new Error('not fount member')
      }
      
      /*--------------------------------------------------*/

      // キャッシュからグループ取得
      const checkGroup = await cache.getGroup(_group.gid)
      // メンバー取得
      const checkMember = await Members.findOne({ gid:_group.gid, mid:_group.mid }).select('mid moid pmid scount dmmode chtime')
      // オブジェクト
      const checkMemberObject = await Objects.findOne({ gid:_group.gid, oid:checkMember.moid }).select('status icon name')

      // マイグループならグループ名をセットしない
      const gname = (checkGroup.mode !== cmn.MYGROUP_GMODE) ? checkGroup.name : ''
      
      // メンバーセット
      json.member = {
        gid: checkGroup.gid,
        goid: checkGroup.goid,
        pgid: checkGroup.pgid,
        mid: checkMember.mid,
        moid: checkMember.moid,
        pmid: checkMember.pmid,
        scount: checkMember.scount,
        dmmode: checkMember.dmmode,
        chtime: checkMember.chtime,
        gname: gname,
        icon: checkMemberObject.icon,
        name: checkMemberObject.name,
      }
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, json, err)
    } finally {
      // JSON送信
      apUti.sendJSON(res, json)
    }
  }

  doAsync(req, res)
})

// ユーザー取得
router.get('/user/:pmid/:moid', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const pmid = ckUti.checkId(req.params.pmid) ? req.params.pmid : ''
        const moid = ckUti.checkId(req.params.moid) ? req.params.moid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!pmid || !moid) {
          json.code = 400
          throw new Error('invalid get')
        }
    
        // 所属メンバーチェック
        const _group = apUti.checkBelongMember(req, json, moid)

        // 公開IDチェック
        apUti.checkPid(json, pmid)
        // NG公開IDチェック
        apUti.checkNgPid(json, pmid)

        /*--------------------------------------------------*/

        // メンバー取得
        const checkMember = await Members.findOne({ pmid:pmid }).select('-_id')
        if (!checkMember) {
          json.objectInfo = null
          return
        }
        // oidチェック
        const checkObject = await apUti.checkOid(json, '', checkMember.moid)
        // オブジェクト情報取得
        const objectInfo = await apUti.getObjectInfo(req, json, _group, checkObject, checkMember)

        json.objectInfo = objectInfo
      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// グループ情報取得
router.get('/info/:gid', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {
    
    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const gid = ckUti.checkId(req.params.gid) ? req.params.gid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid get')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // オーナーチェック
        if (_group.ooid !== _group.moid) {
          json.code = 400
          throw new Error('invalid group not owner')  
        }
        
        /*--------------------------------------------------*/

        // グループ取得
        const checkGroup = await Groups.findById(gid).select('ctime mode settings')
        if (!checkGroup) {
          throw new Error('not found group')
        }

        const groupInfo = {
          ctime: checkGroup.ctime,
          mode: checkGroup.mode,
          maxmem: checkGroup.settings.get('maxmem'),
          maxobj: checkGroup.settings.get('maxobj'),
          filesize: checkGroup.settings.get('filesize'),
          filecapa: checkGroup.settings.get('filecapa'),
        }

        json.groupInfo = groupInfo
        
      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// メンバー情報取得
router.get('/member/info/:gid', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {
    
    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const gid = ckUti.checkId(req.params.gid) ? req.params.gid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid get')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        
        /*--------------------------------------------------*/

        // グループ取得
        const checkGroup = await Groups.findById(gid).select('settings')
        if (!checkGroup) {
          throw new Error('not found group')
        }
        // メンバー取得
        const checkMember = await Members.findById(_group.mid).select('ctime')
        if (!checkMember) {
          throw new Error('not found member')
        }
        
        const memberInfo = {
          ctime: checkMember.ctime,
          maxstar: checkGroup.settings.get('maxstar'),
        }

        json.memberInfo = memberInfo

      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// オブジェクト情報取得(所属、公開グループのみ)
router.get('/object/info/:oid', function(req, res, next) {
    
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const oid = ckUti.checkId(req.params.oid) ? req.params.oid : ''

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!oid) {
        json.code = 400
        throw new Error('invalid get')
      }
      
      // 所属メンバーチェック
      const _group = (moid) ? apUti.checkBelongMember(req, json, moid) : null

      // オブジェクト取得
      const checkObject = await Objects.findById(oid).select('-_id')
      if (!checkObject) {
        json.objectInfo = null
        return
      }
      // メンバー
      let checkMember = null
      if (checkObject.type === cmn.MEMBER_OTYPE) {
        // moidチェック
        checkMember = await apUti.checkMoid(json, checkObject.oid)
      }
      
      /*--------------------------------------------------*/

      // オブジェクト情報取得
      const objectInfo = await apUti.getObjectInfo(req, json, _group, checkObject, checkMember)

      if (checkObject.type !== cmn.MEMBER_OTYPE && objectInfo && !objectInfo.pub)  { // メンバータイプではなくて非公開なら
        json.code = 400
        throw new Error('invalid object info')
      }

      json.objectInfo = objectInfo
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, json, err)
    } finally {
      // JSON送信
      apUti.sendJSON(res, json)
    }
  }

  doAsync(req, res)
})

// オブジェクトDM取得(DMできるかチェック)
router.get('/object/dm/:dmoid', function(req, res, next) {
    
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const dmoid = ckUti.checkId(req.params.dmoid) ? req.params.dmoid : ''
      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!dmoid && !moid) {
        json.code = 400
        throw new Error('invalid get')
      }
      
      // 所属メンバーチェック
      const _group = (moid) ? apUti.checkBelongMember(req, json, moid) : null
      // dmoidチェック
      const checkObject = await apUti.checkOid(json, '', dmoid)
      // タイプチェック
      if (checkObject.type !== cmn.MEMBER_OTYPE) {
        json.code = 400
        throw new Error('invalid dmoid')
      }
      const checkMember = await apUti.checkMoid(json, checkObject.oid)
      
      /*--------------------------------------------------*/
      
      // グループ外、ダイレクトメッセージポリシーチェック
      const dm = await apUti.checkDirectMessagePolicy(json, checkMember, _group)

      json.dm = dm
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, json, err)
    } finally {
      // JSON送信
      apUti.sendJSON(res, json)
    }
  }

  doAsync(req, res)
})

// オブジェクト取得
router.get('/object/:gid/:oid', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const gid = ckUti.checkId(req.params.gid) ? req.params.gid : ''
        const oid = ckUti.checkId(req.params.oid) ? req.params.oid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid) {
          json.code = 400
          throw new Error('invalid get')
        }

        // 所属グループチェック
        apUti.checkBelongGroup(req, json, gid)
        
        /*--------------------------------------------------*/

        // オブジェクト取得
        const checkObject = await Objects.findOne({ gid:gid, oid:oid }).select('-messages -ctime') // tasg g 削除予定
        // 取得オブジェクトタイプチェック
        apUti.checkGetObjectType(json, checkObject.type)

        // resオブジェクトセット
        await obUti.setResObject([checkObject])
        json.object = checkObject
      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// メンバー追加取得
router.get('/addmembers/:gid', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {
    
    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const gid = ckUti.checkId(req.params.gid) ? req.params.gid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid get')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループ管理者チェック
        await apUti.checkGroupAdmin(json, _group)

        /*--------------------------------------------------*/
        
        // メンバー追加取得
        const checkAddmembers = await Addmembers.find({ gid:gid }).sort({ ctime:-1 })
        if (checkAddmembers) {
          json.addmembers = checkAddmembers
        } else {
          json.code = 404
          throw new Error('failed find add members')
        }
      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// メンバー参加表示
router.get('/join/:amid', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {
    
    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const amid = ckUti.checkId(req.params.amid) ? req.params.amid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!amid) {
          json.code = 400
          throw new Error('invalid get')
        }

        // amidチェック
        const addmember = await apUti.checkAmid(json, amid)

        let mail = ''
        let pmid = ''
        // メールアドレスチェック
        if (ckUti.checkMail(addmember.sendid)) {
          mail = addmember.sendid
        } else {
          // PIDチェック
          if (ckUti.checkPid(addmember.sendid)) {
            pmid = addmember.sendid
          }
        }
        
        // グループ取得
        const checkGroup = await Groups.findById(addmember.gid).select('gid goid pgid')
        // グループオブジェクト取得
        const checkGroupObject = await Objects.findById(checkGroup.goid).select('name')
        
        // グループ参加済みチェック
        if (addmember.status === cmn.JOIN_AMSTATUS || cmn.getAccountGroup(req, checkGroup.gid)) {
          json.message = 'グループに参加しました'
        }

        // 送信IDチェック

        let sgid = ''

        if (mail) {
          // ログイン中のアカウントの登録メール一致するかチェック
          if (mail !== req.session.account.mail) {
            json.message = 'ログイン中のアカウントと招待されたメールアドレスが一致しません'
          }
        }

        if (pmid) {
          // ログイン中のアカウントpmidのメンバーがいてるかチェック
          const midArray = []
          req.session.account.groups.map(g => midArray.push(g.mid))
          const checkMembers = await Members.find({ mid:{ $in: midArray }}).select('gid moid pmid')
          const member = checkMembers.find(m => m.pmid === pmid)
          if (member) {
            sgid = member.gid
          } else {
            json.message = 'ログイン中のアカウントに招待されたメンバーはいません'
          }
        }

        json.addmember = { pgid:checkGroup.pgid, groupName:checkGroupObject.name, sgid:sgid }
      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// お気に入り一覧取得
router.get('/star/list', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : ''
        const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
        const page = ckUti.checkStrNumber(req.query.p) ? req.query.p : ''
        const viewType = ckUti.checkStrNumber(req.query.v) ? req.query.v : ''
        const checkTime = ckUti.checkStrNumber(req.query.t) ? req.query.t : ''

        const offsetMinus = ckUti.checkStrNumber(req.query.om) ? req.query.om : '0'

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !page || !viewType || !checkTime) {
          json.code = 400
          throw new Error('invalid get')
        }

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // 表示タイプチェック
        if (
          (viewType !== String(cmn.ACTIVE_STYPE)) &&
          (viewType !== String(cmn.PASSIVE_STYPE))
        ) {
          json.code = 400
          throw new Error('invalid view type')
        }

        // チェック時間
        const numberCheckTime = parseInt(checkTime)

        // オフセット
        const numberOffsetMinus = parseInt(offsetMinus)
        
        /*--------------------------------------------------*/

        // 検索条件
        const find = (viewType === String(cmn.ACTIVE_STYPE)) ?
          { gid:_group.gid, moid:_group.moid, type:cmn.MEMBER_OTYPE, ctime:{ $lt:numberCheckTime } } : 
          { tgid:_group.gid, toid:_group.moid, type:cmn.MEMBER_OTYPE, ctime:{ $lt:numberCheckTime } }
        // 指定列
        const project = { _id:0, utime:0 } // _id、utimeはselectしない
        // 並び順
        const sort = { ctime:-1 }
        // ページ
        const numberPage = parseInt(page)
        // スキップ
        let skip = (numberPage * cmn.STAR_READ_LIMIT) - numberOffsetMinus
        if (skip < 0) skip = 0

        // コメント取得
        const aggregateAry = [
          { $match: find }, 
          { $project: project },
          { $sort: sort },
          { $limit: cmn.STAR_READ_LIMIT + skip }, 
          { $skip: skip },
        ]
        if (viewType === String(cmn.PASSIVE_STYPE)) { // 登録されている
          aggregateAry.push(_getPassiveStarLookup(_group))
        }
        const stars = await Stars.aggregate(aggregateAry)
        if (!stars) {
          throw new Error('failed find stars')
        }

        // オブジェクト情報セット

        const gidSet = new Set()
        const oidSet = new Set()
        for (let star of stars) {
    
          let _star = star
          if ('_doc' in star) _star = star._doc

          const gid = (viewType === String(cmn.ACTIVE_STYPE)) ? _star.tgid : _star.gid
          const oid = (viewType === String(cmn.ACTIVE_STYPE)) ? _star.toid : _star.moid
    
          if (gid !== sgid) { // グループが選択gidでは無い
            gidSet.add(gid)
            oidSet.add(oid)
          }
        }
        
        // 一意の配列に変換
        const oidArray = Array.from(oidSet)
    
        let checkObjects = []
        if (oidArray.length > 0) {
          checkObjects = await Objects.find({ gid:{ $ne:sgid }, oid:{ $in:oidArray } }).select('gid oid status type icon name')
        }
    
        // グループ
        checkObjects.map(o => {
          if (o.gid !== sgid) gidSet.add(o.gid)
        })
        const gidArray = Array.from(gidSet)
        let checkGroups = []
        if (gidArray.length > 0) {
          checkGroups = await Groups.find({ gid:{ $ne:sgid }, gid:{ $in:gidArray } }).select('gid mode status pub name')
        }
    
        // オブジェクトのグループチェック
        for (let checkObject of checkObjects) {
          checkObject._doc.gname = ''
          if (checkObject.gid !== sgid) {
            const group = checkGroups.find(g => g.gid === checkObject.gid)
            if (group) {
              // グループ名セット
              checkObject._doc.gname = group.name
              // グループ停止チェック
              if (group.status === cmn.STOP_GSTATUS) {
                checkObject._doc.status = cmn.STOP_OSTATUS // 停止
              }
              // マイグループならグループ名をセットしない
              if (group.mode === cmn.MYGROUP_GMODE) {
                checkObject._doc.gname = ''
              }
            } else {
              // グループ削除
              checkObject._doc.oid = '' // オブジェクトクリア
            }
          }
        }
        
        for (let star of stars) {
    
          let _star = star
          if ('_doc' in star) _star = star._doc

          const gid = (viewType === String(cmn.ACTIVE_STYPE)) ? _star.tgid : _star.gid
          const oid = (viewType === String(cmn.ACTIVE_STYPE)) ? _star.toid : _star.moid
          
          // オブジェクトセット
          if (gid !== sgid) {
            const obj = checkObjects.find(o => o.oid === oid)
            _star.obj = (obj) ? obj._doc : null
            if (obj && obj.status === cmn.DELETE_OSTATUS) { // 状態が削除なら
              const accountGroup = cmn.getAccountGroup(req, obj.gid)
              if (!accountGroup) { // 所属では無いなら
                _star.obj = null
              }
            }
          }

          _star.star = true

          if ((viewType === String(cmn.PASSIVE_STYPE))) {
            if ('rsub' in _star && _star.rsub.length === 1)
              _star.star = true
            else
              _star.star = false
          }

          // 不必要なフィールド削除
          if ('rsub' in _star) delete _star.rsub
        }

        json.stars = stars
      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

//#endregion

/*--------------------------------------------------*/
//#region POST

// グループ作成
router.post('/new', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const name = ckUti.checkStr(req.body.name) ? req.body.name : ''
        const user_name = ckUti.checkStr(req.body.user_name) ? req.body.user_name : ''
        const mode = ckUti.checkNumber(req.body.mode) ? req.body.mode : 0

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!name || !user_name || !mode) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 名前チェック
        apUti.checkStrLength(json, name, 25, 'name')
        // 表示名前チェック
        apUti.checkStrLength(json, user_name, 25, 'user_name')
        // モードチェック
        if (!(mode === cmn.GROUPWARE_GMODE || mode === cmn.HOMEPAGE_GMODE)) {
          json.code = 400
          throw new Error('invalid mode')
        }

        // グループ数チェック
        await apUti.checkGroupCount(req, json)

        /*--------------------------------------------------*/
        
        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // ObjectId手動生成
        const _gid = new mongoose.Types.ObjectId
        const _goid = new mongoose.Types.ObjectId
        const _mid = new mongoose.Types.ObjectId
        const _moid = new mongoose.Types.ObjectId
        const gid = String(_gid)
        const goid = String(_goid)
        const mid = String(_mid)
        const moid = String(_moid)

        // グループ公開ID生成
        const pgid = await apUti.generatePid(session)
        // メンバー公開ID生成
        const pmid = await apUti.generatePid(session)
        
        // 公開
        const pub = (mode === cmn.HOMEPAGE_GMODE) ? true : false // ホームページモードモードなら公開

        // グループタイプ
        let groupType
        if (mode === cmn.GROUPWARE_GMODE) groupType = cmn.GGROUP_OTYPE
        if (mode === cmn.HOMEPAGE_GMODE) groupType = cmn.HGROUP_OTYPE

        // メンバーオブジェクト作成
        const newMemberObject = await Objects.create(
          [{
            _id: _moid,
            gid: gid,
            oid: moid,
            status: cmn.NORMAL_OSTATUS,
            nstatus: cmn.NORMAL_ONSTATUS,
            ntext: '',
            type: cmn.MEMBER_OTYPE,
            image: '',
            icon: '',
            name: user_name,
            data: { profile:'' },
            members: [],
            items: [],
            messages: [],
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newMemberObject) {
          throw new Error('failed create member object')
        }

        // メンバー作成
        const newMember = await Members.create(
          [{
            _id: _mid,
            gid: gid,
            mid: mid,
            moid: moid,
            pmid: pmid,
            dmmode: cmn.ALL_DMMODE,
            settings: {},
            chtime: ntime,
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newMember) {
          throw new Error('failed create member')
        }

        // グループオブジェクト作成
        const newGroupObject = await Objects.create(
          [{
            _id: _goid,
            gid: gid,
            oid: goid,
            status: cmn.NORMAL_OSTATUS,
            nstatus: cmn.NORMAL_ONSTATUS,
            ntext: '',
            type: groupType,
            image: '',
            icon: '',
            name: name,
            data: { profile:'' },
            members: [{
              role: cmn.ADMIN_ROLE, // 管理者
              oid: moid,
            }],
            items: [],
            messages: [],
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newGroupObject) {
          throw new Error('failed create member object')
        }

        // グループ作成
        const newGroup = await Groups.create(
          [{
            _id: _gid,
            gid: gid,
            goid: goid,
            ooid: moid,
            pgid: pgid,
            mode: mode,
            status: cmn.NORMAL_GSTATUS,
            pub: pub,
            name: name,
            settings: {
              maxmem: cmn.MAX_MEM,
              maxobj: cmn.MAX_OBJ,
              maxstar: cmn.MAX_STAR,
              filecapa: cmn.FILE_CAPA,
              filesize: 0
            },
            iutime: ntime,
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newGroup) {
          throw new Error('failed create group')
        }

        // アカウント取得
        const setAccount = await Accounts.findById(req.session.account.aid).session(session)
        // アカウントグループ追加
        setAccount.groups.push({
          gid: gid,
          goid: goid,
          mid: mid,
          moid: moid,
        })
        setAccount.utime = ntime
        // アカウント更新
        const updateAccount = await setAccount.save({ session:session })
        if (!updateAccount) {
          throw new Error('failed update account')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // ログインセッションセット
        await apUti.setLoginSession(req, res, updateAccount)
        // アカウントグループ取得
        const _group = cmn.getAccountGroup(req, gid)

        json.accountGroup = _group
        json.utime = ntime

        // グループ作成は最初作ったアカウント以外追加される事は無いのでポーリングデータは無し
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// グループ削除
router.post('/delete', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループモードチェック
        if (_group.mode !== cmn.GROUPWARE_GMODE && _group.mode !== cmn.HOMEPAGE_GMODE) { // グループウェア、ホームページではない
          json.code = 400
          throw new Error('invalid group mode')
        }
        // オーナーチェック
        if (_group.ooid !== _group.moid) {
          json.code = 400
          throw new Error('failed group not owner')  
        }

        /*--------------------------------------------------*/

        const goid = _group.goid

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // グループ取得
        const setGroup = await Groups.findById(gid).session(session)
        // グループ削除
        await dbUti.deleteGroup(setGroup, session)
        // キャッシュのグループ削除
        await cache.deleteData(`gp:${gid}`)

        // アカウントグループ削除
        const setAccounts = await Accounts.find({ 'groups.gid':gid }).session(session)
        for (let setAccount of setAccounts) {
          const index = setAccount.groups.findIndex(g => g.gid === gid)
          if (index > -1) {
            setAccount.groups.splice(index, 1)
            setAccount.utime = ntime
            // アカウント更新
            const updateAccount = await setAccount.save({ session:session })
            if (!updateAccount) {
              throw new Error('failed update account')
            }
          }
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // アカウントグループ削除
        apUti.deleteAccountGroup(req, gid)
        
        json.utime = ntime

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, { oid:goid, utime:ntime }, cmn.DELETE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// デフォルトグループにする
router.post('/default', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        apUti.checkBelongGroup(req, json, gid)

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // アカウント取得
        const setAccount = await Accounts.findById(req.session.account.aid).session(session)
        if (!setAccount) {
          throw new Error('failed find account')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        setAccount.dgid = gid
        setAccount.utime = ntime
        // アカウント更新
        const updateAccount = await setAccount.save({ session:session })
        if (!updateAccount) {
          throw new Error('failed update account')
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // セッション更新
        req.session.account.dgid = gid
        req.session.account.utime = ntime

        json.utime = ntime
        
        // 自分自身だけなのでポーリングデータセット無し(タブを複数開いていたら一時的におかしくなる)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// ユーザー検索
router.post('/user/serach', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const pmid = ckUti.checkStr(req.body.pmid) ? req.body.pmid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!moid || !pmid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属メンバーチェック
        const _group = apUti.checkBelongMember(req, json, moid)

        // 公開IDチェック
        apUti.checkPid(json, pmid)
        // NG公開IDチェック
        if (!ckUti.checkNgPid(pmid)) {
          json.objectInfo = null
          return
        }

        /*--------------------------------------------------*/

        // メンバー取得
        const checkMember = await Members.findOne({ pmid:pmid }).select('-_id')
        if (!checkMember) {
          json.objectInfo = null
          return
        }
        // oidチェック
        const checkObject = await apUti.checkOid(json, '', checkMember.moid)
        // オブジェクト情報取得
        const objectInfo = await apUti.getObjectInfo(req, json, _group, checkObject, checkMember)

        json.objectInfo = objectInfo
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// ユーザー変更
router.post('/user/change', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // アカウントグループチェック
        if (!await checkAccountGroup(req, _group)) {
          json.code = 400
          throw new Error('invalid change user')
        }

        /*--------------------------------------------------*/

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // セッション更新
        req.session.account.sgid = gid
        req.session.account.utime = ntime

        json.utime = ntime

        // 自分自身だけなのでポーリングデータセット無し(タブを複数開いていたら一時的におかしくなる)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// 公開変更
router.post('/pub/change', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)
        
        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const pub = ckUti.checkBoolean(req.body.pub) ? req.body.pub : null

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || pub === null) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループモードチェック
        if (_group.mode !== cmn.MYGROUP_GMODE && _group.mode !== cmn.HOMEPAGE_GMODE) { // マイグループ、ホームページグループ以外なら
          json.code = 400
          throw new Error('invalid group mode mygroup')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // グループ取得
        const setGroup = await Groups.findById(gid).session(session)
        setGroup.pub = pub
        setGroup.utime = ntime
        // グループ更新
        const updateGroup = await setGroup.save({ session:session })
        if (!updateGroup) {
          throw new Error('failed update pub')
        }

        // キャッシュのグループ削除
        await cache.deleteData(`gp:${gid}`)

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        json.pub = pub

        // 現在違うブラウザで開いている場合のグループ情報の更新はサポートしない(ブラウザを更新するれば変わる為)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// 色変更
router.post('/color/change', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const color1 = ckUti.checkStr(req.body.color1) ? req.body.color1 : ''
        const color2 = ckUti.checkStr(req.body.color2) ? req.body.color2 : ''
        const color3 = ckUti.checkStr(req.body.color3) ? req.body.color3 : ''
        const color4 = ckUti.checkStr(req.body.color4) ? req.body.color4 : ''
        const color5 = ckUti.checkStr(req.body.color5) ? req.body.color5 : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        apUti.checkBelongGroup(req, json, gid)
        
        // 色チェック
        if (color1) {
          apUti.checkStrLength(json, color1, 25, 'color1')
        }
        if (color2) {
          apUti.checkStrLength(json, color2, 25, 'color2')
        }
        if (color3) {
          apUti.checkStrLength(json, color3, 25, 'color3')
        }
        if (color4) {
          apUti.checkStrLength(json, color4, 25, 'color4')
        }
        if (color5) {
          apUti.checkStrLength(json, color5, 25, 'color5')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // グループ取得
        const setGroup = await Groups.findById(gid).session(session)

        if (color1) {
          setGroup.settings.set('color1', color1)
        } else {
          if (setGroup.settings.get('color1')) setGroup.settings.delete('color1')
        }
        if (color2) {
          setGroup.settings.set('color2', color2)
        } else {
          if (setGroup.settings.get('color2')) setGroup.settings.delete('color2')
        }
        if (color3) {
          setGroup.settings.set('color3', color3)
        } else {
          if (setGroup.settings.get('color3')) setGroup.settings.delete('color3')
        }
        if (color4) {
          setGroup.settings.set('color4', color4)
        } else {
          if (setGroup.settings.get('color4')) setGroup.settings.delete('color4')
        }
        if (color5) {
          setGroup.settings.set('color5', color5)
        } else {
          if (setGroup.settings.get('color5')) setGroup.settings.delete('color5')
        }
        
        setGroup.utime = ntime
        // グループ更新
        const updateGroup = await setGroup.save({ session:session })
        if (!updateGroup) {
          throw new Error('failed update color')
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        json.settings = updateGroup.settings

        // 現在違うブラウザで開いている場合のグループ情報の更新はサポートしない(ブラウザを更新するれば変わる為)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// DMモード変更
router.post('/dmmode/change', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const dmmode = ckUti.checkNumber(req.body.dmmode) ? req.body.dmmode : 0

        //--------------------------------------------------
        // チェック

        // 必須チェック
        if (!gid || !dmmode) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        
        // DMモードチェック
        if (dmmode !== cmn.ALL_DMMODE && dmmode !== cmn.LIMITED_DMMODE && dmmode !== cmn.NONE_DMMODE) {
          json.code = 400
          throw new Error('invalid dmmode')
        }
        
        //--------------------------------------------------
        
        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // メンバー取得
        const setMember = await Members.findById(_group.mid).session(session)
        setMember.dmmode = dmmode
        setMember.utime = ntime
        // メンバー更新
        const updateMember = await setMember.save({ session:session })
        if (!updateMember) {
          throw new Error('failed update dmmode')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.dmmode = dmmode
        
        // 現在違うブラウザで開いている場合のメンバー情報の更新はサポートしない(ブラウザを更新するれば変わる為)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// 招待
router.post('/invitation', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const id = ckUti.checkStr(req.body.id) ? req.body.id : ''

        const message = ckUti.checkStr(req.body.message) ? req.body.message : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !id) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループモードチェック
        if (_group.mode === cmn.MYGROUP_GMODE) { // マイグループなら
          json.code = 400
          throw new Error('invalid group mode mygroup')
        }

        // idがメールかIDかチェック
        
        let mail = ''
        let pmid = ''

        // メールアドレスチェック
        if (ckUti.checkMail(id)) {
          mail = id
        } else {
          // PIDチェック
          if (ckUti.checkPid(id)) {
            pmid = id
          }
        }

        if (mail === '' && pmid === '') {
          json.errors.id = '無効なメールアドレスまたはメンバーIDです'
          throw new Error('invalid invitation id')
        }

        const checkAddmember = await Addmembers.findOne({ gid:gid, status:cmn.INVITATION_AMSTATUS, sendid:id }).select('_id')
        if (checkAddmember) {
          json.errors.id = '既に同じメールアドレスかメンバーIDが送信されています'
          throw new Error('invalid invitation id')  
        }

        if (mail) {
          // アカウント取得
          const checkAccount = await Accounts.findOne({ mail:mail }).select('groups')
          if (checkAccount) {
            if (checkAccount.groups.find(g => g.gid === gid)) {
              json.errors.id = '既にメンバー登録されています'
              throw new Error('invalid invitation id')  
            }
          } else {
            json.errors.id = 'このメールアドレスで登録されたアカウントは存在しません'
            throw new Error('invalid invitation id')
          }
        }

        if (pmid) {
          // メンバー取得
          const checkMember = await Members.findOne({ pmid:pmid }).select('mid')
          if (checkMember) {
            const checkAccount = await Accounts.findOne({ 'groups.mid': checkMember.mid }).select('groups')
            if (checkAccount && checkAccount.groups.find(g => g.gid === gid)) {
              json.errors.id = '既にメンバー登録されています'
              throw new Error('invalid invitation id')  
            }
          } else {
            json.errors.id = '存在しないメンバーIDです'
            throw new Error('invalid invitation id')
          }
        }

        // グループ管理者チェック
        await apUti.checkGroupAdmin(json, _group)
        // メンバー数チェック
        await apUti.checkMemberCount(json, gid)

        // メッセージチェック
        if (message) {
          apUti.checkStrLength(json, message, 100, 'message')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // ObjectId手動生成
        const _amid = new mongoose.Types.ObjectId
        const _mid = new mongoose.Types.ObjectId
        const amid = String(_amid)
        const mid = String(_mid)

        const checkGroupObject = await Objects.findById(_group.goid).select('name').session(session)
        
        const url = `${cmn.SERVER_NAME}/join/${amid}`

        let newMessage = null

        if (pmid) {
          const checkMember = await Members.findOne({ pmid:pmid }).select('gid moid').session(session)
          const checkMemberGroupObject = await Objects.findById(checkMember.moid).select('oid icon name').session(session)
          const name = checkMemberGroupObject.name
          const data = { oid:checkMemberGroupObject.oid, icon:checkMemberGroupObject.icon, name:checkMemberGroupObject.name }
          
          const nameAry = [...name] // 絵文字対応するため文字配列にする

          let text = `${name}${url}から参加して下さい。`
              
          const blocks = [
            { offset:0, len:nameAry.length, entities:[{type: cmn.MEMBER_OTYPE, offset:0, len:nameAry.length, data:data}] },
            { offset:nameAry.length, len:url.length, entities:[{type: cmn.LINK_OTYPE, offset:0, len:url.length, data:{}}] },
            { offset:nameAry.length + url.length, len:'から参加して下さい。'.length, entities:[] },
          ]

          if (message) {
            const textAry = [...text]
            const messageAry = [...message]

            const messageTitle = 'メッセージ:'
            text = `${text}${messageTitle}${message}`

            blocks.push({ offset:textAry.length, len:0, entities:[] })
            blocks.push({ offset:textAry.length, len:messageTitle.length, entities:[] })
            blocks.push({ offset:textAry.length + messageTitle.length, len:messageAry.length, entities:[] })
          }

          const titleStr = `${checkGroupObject.name}に招待されました`

          // 招待メッセージ作成
          const newMessages = await Messages.create(
            [{
              _id: _mid,
              gid: checkMember.gid,
              mid: mid,
              mkey: cmn.generateReverseObjectId(),
              type: cmn.MESSAGE_MTYPE,
              status: cmn.NOMAL_MSTATSU,
              pub: false,
              wgid: cmn.SYSTEM_GID,
              wmoid: cmn.SYSTEM_OID,
              stext: titleStr,
              pmode: cmn.MEMBER_PMODE,
              members: [checkMember.moid],
              objects: [checkMember.moid],
              title: titleStr,
              text: text,
              blocks: blocks,
              ctime: ntime,
              etime: ntime,
              htime: ntime,
              utime: ntime,
            }],
            { session:session })
          if (!newMessages) {
            throw new Error('failed create message')
          }
          newMessage = newMessages[0]
        }

        // メンバー追加作成
        const newAddmember = await Addmembers.create(
          [{
            _id: _amid,
            gid: gid,
            amid: amid,
            status: cmn.INVITATION_AMSTATUS,
            sendid: id,
            message: message,
            // moid: 
            // name:
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newAddmember) {
          throw new Error('failed create add member')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.addmember = newAddmember

        if (mail) {
          let to = mail
          if (process.env.TEST_MAIL) to = process.env.TEST_MAIL
          const subject = `${checkGroupObject.name}に招待されました`
          const text = `${url}\nから参加してください。${(message) ? `\n\nメッセージ:\n${message}` : ''}`
          // メール送信
          mlUti.sendMail(to, subject, text)
        }

        if (newMessage) {
          // メッセージポーリングデータセット
          cache.setMessagePollingData(newMessage, cmn.NEW_PTYPE)
        }
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// メンバー追加削除
router.post('/addmember/delete', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const amid = ckUti.checkId(req.body.amid) ? req.body.amid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !amid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループモードチェック
        if (_group.mode === cmn.MYGROUP_GMODE) { // マイグループなら
          json.code = 400
          throw new Error('invalid group mode mygroup')
        }

        // amidチェック
        await apUti.checkAmid(json, amid, false)
        // グループ管理者チェック
        await apUti.checkGroupAdmin(json, _group)

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // メンバー追加取得 
        const setAddmember = await Addmembers.findOne({ gid:gid, amid:amid }).session(session)
        // メンバー追加削除
        await dbUti.deleteAddmember(setAddmember, session)
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.addmember = null

      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// オブジェクト追加
const addObject = (req, res, type) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = (req.body.gid) ? req.body.gid : ''
        const oid = (req.body.oid) ? req.body.oid : ''
        const name = (req.body.name) ? req.body.name : ''
        
        /*--------------------------------------------------*/
        // チェック
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)
        // タイプチェック
        if (
          checkObject.type !== cmn.MGROUP_OTYPE &&
          checkObject.type !== cmn.GGROUP_OTYPE &&
          checkObject.type !== cmn.HGROUP_OTYPE &&
          checkObject.type !== cmn.SUBGROUP_OTYPE
        ) {
          json.code = 400
          throw new Error('invalid oid')
        }
        // オブジェクト管理者チェック
        await apUti.checkObjectAdmin(json, _group, checkObject)
        // 名前チェック
        apUti.checkStrLength(json, name, 25, 'name')
        // オブジェクト数チェック
        await apUti.checkObjectCount(json, gid)

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // ObjectId手動生成
        const _id = new mongoose.Types.ObjectId
        const id = String(_id)

        // オブジェクト作成
        const newObjects = await Objects.create(
          [{
            _id: _id,
            gid: gid,
            oid: id,
            status: cmn.NORMAL_OSTATUS,
            nstatus: cmn.NORMAL_ONSTATUS,
            ntext: '',
            type: type,
            image: '',
            icon: '',
            name: name,
            data: { profile:'' },
            members: [],
            items: [],
            messages: [],
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newObjects) {
          throw new Error('failed create object')
        }
        const newObject = newObjects[0]
        
        // 親オブジェクトにアイテム追加
        const setParentObject = await Objects.findOne({ gid:gid, oid:oid }).session(session)
        setParentObject.items.push({
          oid: id
        })
        setParentObject.utime = ntime
        // 親オブジェクト更新
        const updateParentObject = await setParentObject.save({ session:session })
        if (!updateParentObject) {
          throw new Error('failed update object')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        // resオブジェクトセット
        await obUti.setResObject([newObject])
        json.object = newObject
        
        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, newObject, cmn.NEW_PTYPE, oid)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
}

// サブグループ追加
router.post('/subgroup/add', (req, res, next) => {
  // オブジェクト追加
  addObject(req, res, cmn.SUBGROUP_OTYPE)
})

// 話題追加
router.post('/topic/add', (req, res, next) => {
  // オブジェクト追加
  addObject(req, res, cmn.TOPIC_OTYPE)
})

// オブジェクト停止
router.post('/object/stop', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''
        const isStop = ckUti.checkBoolean(req.body.isStop) ? req.body.isStop : null

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid || isStop === null) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)
        // 取得オブジェクトタイプチェック
        apUti.checkGetObjectType(json, checkObject.type)
        // オブジェクト管理者チェック
        await apUti.checkObjectAdmin(json, _group, checkObject)

        // マイグループチェック
        if (checkObject.type === cmn.MGROUP_OTYPE) { // マイグループは停止できない
          json.code = 400
          throw new Error('invalid group type')
        }
        // グループオブジェクトチェック
        if (checkObject.type === cmn.GGROUP_OTYPE || checkObject.type === cmn.HGROUP_OTYPE) { //　グループウェア、ホームページのみ
          if (_group.goid === oid) {
            // オーナーチェック
            if (_group.ooid !== _group.moid) {
              json.code = 400
              throw new Error('failed group not owner')  
            }
          } else {
            json.code = 400
            throw new Error('invalid group oid')
          }
        }
        if (checkObject.status === cmn.DELETE_OSTATUS) { // 削除チェック
          json.code = 400
          throw new Error('invalid object delete')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // オブジェクトの状態を変更
        const setObject = await Objects.findOne({ gid:gid, oid:oid }).session(session)
        setObject.status = (isStop) ? cmn.STOP_OSTATUS : cmn.NORMAL_OSTATUS
        setObject.utime = ntime
        // オブジェクト更新
        const updateObject = await setObject.save({ session:session })
        if (!updateObject) {
          throw new Error('failed save object')
        }

        // グループウェアモード、ホームページモードならグループの状態を変更
        let updateGroup = null
        if (updateObject.type === cmn.GGROUP_OTYPE || updateObject.type === cmn.HGROUP_OTYPE) {
          const setGroup = await Groups.findById(gid).session(session)
          setGroup.status = (isStop) ? cmn.STOP_GSTATUS : cmn.NORMAL_GSTATUS
          // ホームページモードならグループの公開を変更
          if (updateObject.type === cmn.HGROUP_OTYPE) {
            setGroup.pub = (isStop) ? false : true
          }
          setGroup.utime = ntime
          // グループ更新
          updateGroup = await setGroup.save({ session:session })
          if (!updateGroup) {
            throw new Error('failed update group')
          }

          // キャッシュのグループ削除
          await cache.deleteData(`gp:${gid}`)
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // resオブジェクトセット
        await obUti.setResObject([updateObject])
        json.object = updateObject

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, updateObject, cmn.UPDATE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// オブジェクト削除
router.post('/object/delete', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)
        // 取得オブジェクトタイプチェック
        apUti.checkGetObjectType(json, checkObject.type)
        // オブジェクト管理者チェック
        await apUti.checkObjectAdmin(json, _group, checkObject)

        // グループオブジェクトチェック
        if (
          checkObject.type === cmn.MGROUP_OTYPE ||
          checkObject.type === cmn.GGROUP_OTYPE ||
          checkObject.type === cmn.HGROUP_OTYPE
        ) {
          // グループオブジェクトはここで削除できない
          json.code = 400
          throw new Error('invalid group type')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // 親オブジェクト変更
        const setParentObjects = await Objects.find({ gid:gid, 'items.oid':oid }).session(session)
        for (let setParentObject of setParentObjects) {
          
          // 親オブジェクトのアイテムから削除
          const index = setParentObject.items.findIndex(i => i.oid === oid)
          if (index > -1) {
            setParentObject.items.splice(index, 1)
            setParentObject.utime = ntime
            // 親オブジェクト更新
            const updateParentObject = await setParentObject.save({ session:session })
            if (!updateParentObject) {
              throw new Error('failed update parent object')
            }
          }
        }

        // オブジェクト取得
        const setObject = await Objects.findOne({ gid:gid, oid:oid }).session(session)

        // 子オブジェクト削除
        for (let item of setObject.items) {
          // 子オブジェクト取得
          const setItemObject = await Objects.findOne({ gid:gid, oid:item.oid }).session(session)
          if (setItemObject && setItemObject.type !== cmn.MEMBER_OTYPE) { // タイプがメンバーでなければ
            if (setItemObject.image) {
              // オブジェクト画像削除
              await flUti.deleteS3Object(cmn.AWS_S3_PUBLIC_BUCKET, `${setItemObject.image}.png`)
            }
            // 子オブジェクト削除
            await dbUti.deleteObject(setItemObject, session)
          }
        }

        if (setObject.image) {
          // オブジェクト画像削除
          await flUti.deleteS3Object(cmn.AWS_S3_PUBLIC_BUCKET, `${setObject.image}.png`)
        }

        // オブジェクト削除
        await dbUti.deleteObject(setObject, session)
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.utime = ntime

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, setObject, cmn.DELETE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// プロフィール変更
router.post('/profile/change', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''
        const name = ckUti.checkStr(req.body.name) ? req.body.name : ''

        const pgid = ckUti.checkStr(req.body.pgid) ? req.body.pgid : ''
        const pmid = ckUti.checkStr(req.body.pmid) ? req.body.pmid : ''
        const image = ckUti.checkStr(req.body.image) ? req.body.image : ''
        const icon = ckUti.checkStr(req.body.icon) ? req.body.icon : ''
        const profile = ckUti.checkStr(req.body.profile) ? req.body.profile : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid || !name ) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)
        // 取得オブジェクトタイプチェック
        apUti.checkGetObjectType(json, checkObject.type)
        // オブジェクト管理者チェック
        await apUti.checkObjectAdmin(json, _group, checkObject)

        // マイグループチェック
        if (checkObject.type === cmn.MGROUP_OTYPE) { // マイグループのグループオブジェクトを変更することは無い
          json.code = 400
          throw new Error('invalid change object type')
        }
        // マイグループオーナーチェック
        let isMygroup = false
        let mygroupOid = ''
        if (_group.mode === cmn.MYGROUP_GMODE && checkObject.type === cmn.MEMBER_OTYPE) {
          if (_group.ooid === oid) {
            isMygroup = true
            mygroupOid = _group.goid
          } else {
            json.code = 400
            throw new Error('invalid mygroup member')
          }
        }
        
        // 公開IDチェック
        if (checkObject.type === cmn.GGROUP_OTYPE || checkObject.type === cmn.HGROUP_OTYPE) {
          if (!pgid) {
            json.code = 400
            throw new Error('invalid post')
          }
          // 公開IDチェック
          apUti.checkPid(json, pgid)
          // NG公開IDチェック
          if (!ckUti.checkNgPid(pgid)) {
            json.errors.pid = '公開IDは既に使用されています'
            throw new Error(`invalid pgid (${pgid})`)
          }
          // 公開ID存在チェック
          const checkPgidGroup = await Groups.findOne({ pgid:pgid }).select('goid')
          const checkPmidMember = await Members.findOne({ pmid:pgid }).select('moid')
          if ((checkPgidGroup && checkPgidGroup.goid !== oid) || checkPmidMember) {
            json.errors.pid = '公開IDは既に使用されています'
            throw new Error(`invalid pgid (${pgid})`)
          }
        }
        if (checkObject.type === cmn.MEMBER_OTYPE) {
          if (!pmid) {
            json.code = 400
            throw new Error('invalid post')
          }
          // 公開IDチェック
          apUti.checkPid(json, pmid)
          // NG公開IDチェック
          if (!ckUti.checkNgPid(pmid)) {
            json.errors.pid = '公開IDは既に使用されています'
            throw new Error(`invalid pmid (${pmid})`)
          }
          // 公開ID存在チェック
          const checkPgidGroup = await Groups.findOne({ pgid:pmid }).select('goid')
          const checkPmidMember = await Members.findOne({ pmid:pmid }).select('moid')
          if (!isMygroup) {
            // マイグループ以外
            if (checkPgidGroup || (checkPmidMember && checkPmidMember.moid !== oid)) {
              json.errors.pid = '公開IDは既に使用されています'
              throw new Error(`invalid pmid (${pmid})`)
            }
          } else {
            // マイグループ
            if ((checkPgidGroup && checkPgidGroup.goid !== mygroupOid) || (checkPmidMember && checkPmidMember.moid !== oid)) {
              json.errors.pid = '公開IDは既に使用されています'
              throw new Error(`invalid pmid (${pmid})`)
            }
          }
        }
        
        // 名前チェック
        apUti.checkStrLength(json, name, 25, 'name')

        // imageチェック
        if (image) {
          apUti.checkPath(json, image, 'image')
        }
        // iconチェック
        if (icon) {
          apUti.checkPath(json, icon, 'icon')
        }
        // プロフィールチェック
        if (profile) {
          apUti.checkStrLength(json, profile, 200, 'profile')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // オブジェクト取得
        const setObject = await Objects.findOne({ gid:gid, oid:oid }).session(session)

        if (setObject.image && setObject.image !== image) {
          // オブジェクト画像削除
          await flUti.deleteS3Object(cmn.AWS_S3_PUBLIC_BUCKET, `${setObject.image}.png`)
        }

        setObject.image = image
        setObject.icon = icon
        setObject.name = name
        setObject.data = { profile:profile }
        setObject.utime = ntime
        // オブジェクト更新
        const updateObject = await setObject.save({ session:session })
        if (!updateObject) {
          throw new Error('failed update object')
        }

        // マイグループオーナーならマイグループオブジェクトも同様に更新
        if (isMygroup) {
          // マイグループオブジェクト取得
          const setMygroupObject = await Objects.findById(mygroupOid).session(session)
          setMygroupObject.image = image
          setMygroupObject.icon = icon
          setMygroupObject.name = name
          setMygroupObject.data = { profile:profile }
          setMygroupObject.utime = ntime
          // マイグループオブジェクト更新
          const updateMygroupObject = await setMygroupObject.save({ session:session })
          if (!updateMygroupObject) {
            throw new Error('failed update object')
          }
        }

        // グループ変更なら
        if (
          updateObject.type === cmn.GGROUP_OTYPE ||
          updateObject.type === cmn.HGROUP_OTYPE ||
          isMygroup // マイグループ
        ) {
          // オブジェクトにpgidセット
          updateObject._doc.pgid = (isMygroup) ? pmid : pgid
          // グループ取得
          const setGroup = await Groups.findById(updateObject.gid).session(session)
          setGroup.pgid = (isMygroup) ? pmid : pgid
          setGroup.name = name
          setGroup.utime = ntime
          // グループ更新
          const updateGroup = await setGroup.save({ session:session })
          if (!updateGroup) {
            throw new Error('failed update pgid')
          }

          // キャッシュのグループ削除
          await cache.deleteData(`gp:${gid}`)
        }

        // メンバー変更なら
        if (updateObject.type === cmn.MEMBER_OTYPE) {
          // オブジェクトにpmidセット
          updateObject._doc.pmid = pmid
          // メンバー取得
          const setMember = await Members.findOne({ moid:updateObject.oid }).session(session)
          setMember.pmid = pmid
          setMember.utime = ntime
          // メンバー更新
          const updateMember = await setMember.save({ session:session })
          if (!updateMember) {
            throw new Error('failed update pmid')
          }
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        if (
          // グループ変更なら
          updateObject.type === cmn.GGROUP_OTYPE ||
          updateObject.type === cmn.HGROUP_OTYPE ||
          isMygroup // マイグループ
        ) {
          if (_group.gid === updateObject.gid) {
            // セッション更新
            _group.pgid = (isMygroup) ? pmid : pgid
            _group.gicon = icon
            _group.gname = name
            req.session.account.utime = ntime
          }
        }

        if (updateObject.type === cmn.MEMBER_OTYPE) {
          if (_group.moid === updateObject.oid) {
            // セッション更新
            _group.pmid = pmid
            _group.icon = updateObject.icon
            _group.name = updateObject.name
            req.session.account.utime = ntime
          }
        }

        // resオブジェクトセット
        await obUti.setResObject([updateObject])
        json.object = updateObject

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, updateObject, cmn.UPDATE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// 状態更新
router.post('/status/update', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''
        const nstatus = ckUti.checkNumber(req.body.nstatus) ? req.body.nstatus : 0

        const ntext = ckUti.checkStr(req.body.ntext) ? req.body.ntext : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid || !nstatus) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)
        // オブジェクト管理者チェック
        await apUti.checkObjectAdmin(json, _group, checkObject)

        // 現在の状態チェック
        if (!(nstatus === cmn.NORMAL_ONSTATUS || nstatus === cmn.ENABLE_ONSTATUS || nstatus === cmn.DISABLE_ONSTATUS)) {
          json.code = 400
          throw new Error('invalid nstatus')
        }
        // 状態テキストチェック
        if (ntext) {
          apUti.checkStrLength(json, ntext, 20, 'ntext')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // オブジェクト取得
        const setObject = await Objects.findOne({ gid:gid, oid:oid }).session(session)
        setObject.nstatus = nstatus
        setObject.ntext = ntext
        setObject.utime = ntime
        // オブジェクト更新
        const updateObject = await setObject.save({ session:session })
        if (!updateObject) {
          throw new Error('failed update object')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // resオブジェクトセット
        await obUti.setResObject([updateObject])
        json.object = updateObject

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, updateObject, cmn.UPDATE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// グループ権限
router.post('/role', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''
        const role = ckUti.checkNumber(req.body.role) ? req.body.role : 0

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid || !role) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 権限チェック
        if (!(role === cmn.ADMIN_ROLE || role === cmn.USER_ROLE)) {
          json.code = 400
          throw new Error('invalid role')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループモードチェック
        if (_group.mode === cmn.MYGROUP_GMODE) { // マイグループなら
          json.code = 400
          throw new Error('invalid group mode mygroup')
        }
        // グループ管理者チェック
        await apUti.checkGroupAdmin(json, _group)

        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)
        // タイプチェック
        if (checkObject.type !== cmn.MEMBER_OTYPE) {
          json.code = 400
          throw new Error('not member object')
        }
        if (oid === _group.ooid) { // オーナーチェック
          json.code = 400
          throw new Error('invalid member object')
        }
        if (oid === _group.moid) { // 自分自身チェック
          json.code = 400
          throw new Error('invalid member object')
        }
        if (checkObject.status === cmn.DELETE_OSTATUS) { // 削除チェック
          json.code = 400
          throw new Error('invalid object delete')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // グループオブジェクト取得
        const setGroupObject = await Objects.findOne({ gid:gid, oid:_group.goid }).session(session)
        const index = setGroupObject.members.findIndex(i => i.oid === oid)
        // 権限セット
        setGroupObject.members[index].role = role
        setGroupObject.utime = ntime
        // グループオブジェクト更新
        const updateGroupObject = await setGroupObject.save({ session:session })
        if (!updateGroupObject) {
          throw new Error('failed update group object')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // resオブジェクトセット
        await obUti.setResObject([updateGroupObject])
        json.object = updateGroupObject

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, updateGroupObject, cmn.UPDATE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// メンバーホームチェック時間
router.post('/member/chtime', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const chtime = ckUti.checkNumber(req.body.chtime) ? req.body.chtime : 0

        //--------------------------------------------------
        // チェック

        // 必須チェック
        if (!gid || !chtime) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)

        // UNIXタイムチェック
        apUti.checkUtime(json, chtime)

        //--------------------------------------------------
        
        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // メンバー取得
        const setMember = await Members.findById(_group.mid).session(session)
        setMember.chtime = chtime
        setMember.utime = ntime
        // メンバー更新
        const updateMember = await setMember.save({ session:session })
        if (!updateMember) {
          throw new Error('failed update chtime')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.chtime = chtime
        
        // 現在違うブラウザで開いている場合のメンバー情報の更新はサポートしない(大量のポーリングデータが作られる為)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// メンバー削除
router.post('/member/delete', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !moid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループモードチェック
        if (_group.mode === cmn.MYGROUP_GMODE) { // マイグループなら
          json.code = 400
          throw new Error('invalid group mode mygroup')
        }

        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, moid)
        // タイプチェック
        if (checkObject.type !== cmn.MEMBER_OTYPE) {
          json.code = 400
          throw new Error('not member object')
        }
        // グループ管理者チェック
        await apUti.checkGroupAdmin(json, _group)

        if (moid === _group.ooid) { // オーナーチェック
          json.code = 400
          throw new Error('invalid member object')
        }
        if (moid === _group.moid) { // 自分自身チェック
          json.code = 400
          throw new Error('invalid member object')
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // 親オブジェクト変更
        const setParentObjects = await Objects.find({ gid:gid, $or:[{'members.oid':moid}, {'items.oid':moid}] }).session(session)
        for (let setParentObject of setParentObjects) {

          // 親オブジェクトのメンバー削除
          const memberIndex = setParentObject.members.findIndex(m => m.oid === moid)
          if (memberIndex > -1) {
            setParentObject.members.splice(memberIndex, 1)

            // 親オブジェクトのアイテムから削除
            const itemIndex = setParentObject.items.findIndex(i => i.oid === moid)
            if (itemIndex > -1) {
              setParentObject.items.splice(itemIndex, 1)
              setParentObject.utime = ntime
            }

            // 親オブジェクト更新
            const updateParentObject = await setParentObject.save({ session:session })
            if (!updateParentObject) {
              throw new Error('failed update parent object')
            }
          }
        }

        // オブジェクト取得
        const setObject = await Objects.findOne({ gid:gid, oid:moid }).session(session)

        if (setObject.image) {
          // オブジェクト画像削除
          await flUti.deleteS3Object(cmn.AWS_S3_PUBLIC_BUCKET, `${gid}/${setObject.image}.png`)
        }

        // オブジェクト削除
        await dbUti.deleteObject(setObject, session)

        // メンバー取得
        const setMember = await Members.findOne({ gid:gid, moid:moid }).session(session)
        // メンバー削除
        await dbUti.deleteMember(setMember, session)
        
        // アカウントグループ削除
        const setAccount = await Accounts.findOne({ 'groups.moid':moid }).session(session)
        if (setAccount) {
          const index = setAccount.groups.findIndex(g => g.moid === moid)
          if (index > -1) {
            setAccount.groups.splice(index, 1)
            setAccount.utime = ntime
            // アカウント更新
            const updateAccount = await setAccount.save({ session:session })
            if (!updateAccount) {
              throw new Error('failed update account')
            }
          }
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.utime = ntime

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, setObject, cmn.DELETE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// グループメンバー更新
router.post('/members/update', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const members = (req.body.members) ? (Array.isArray(req.body.members) ? req.body.members : []) : []
        
        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループモードチェック
        if (_group.mode === cmn.MYGROUP_GMODE) { // マイグループなら
          json.code = 400
          throw new Error('invalid group mode mygroup')
        }

        // グループ管理者チェック
        await apUti.checkGroupAdmin(json, _group)

        // グループオブジェクト取得
        const groupObject = await apUti.checkOid(json, gid, _group.goid)

        // 並び変えだけなので中に同じメンバーがあるかチェック
        for (let beforMember of groupObject.members) {
          const afterMember = members.find(i => i.oid === beforMember.oid)
          if (!afterMember) {
            json.code = 400
            throw new Error('failed members array')
          }
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // グループオブジェクト取得
        const setGroupObject = await Objects.findOne({ gid:gid, oid:_group.goid }).session(session)
        setGroupObject.members = members
        setGroupObject.utime = ntime
        // グループオブジェクト更新
        const updateGroupObject = await setGroupObject.save({ session:session })
        if (!updateGroupObject) {
          throw new Error('failed update group object')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // resオブジェクトセット
        await obUti.setResObject([updateGroupObject])
        json.object = updateGroupObject

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, updateGroupObject, cmn.UPDATE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// グループアイテム更新
router.post('/items/update', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const items = (req.body.items) ? (Array.isArray(req.body.items) ? req.body.items : []) : []

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // グループ管理者チェック
        await apUti.checkGroupAdmin(json, _group)

        // グループオブジェクト取得
        const checkObject = await apUti.checkOid(json, gid, _group.goid)

        // 並び変えだけなので中に同じアイテムがあるかチェック
        for (let beforItem of checkObject.items) {
          const afterItem = items.find(i => i.oid === beforItem.oid)
          if (!afterItem) {
            json.code = 400
            throw new Error('failed items array')
          }
        }

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // グループオブジェクト取得
        const setGroupObject = await Objects.findOne({ gid:gid, oid:_group.goid }).session(session)
        setGroupObject.items = items
        setGroupObject.utime = ntime
        // グループオブジェクト更新
        const updateGroupObject = await setGroupObject.save({ session:session })
        if (!updateGroupObject) {
          throw new Error('failed update group object')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // resオブジェクトセット
        await obUti.setResObject([updateGroupObject])
        json.object = updateGroupObject

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, updateGroupObject, cmn.UPDATE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// サブグループオブジェクト更新
router.post('/subgroup_objects/update', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''
        const items = (req.body.items) ? (Array.isArray(req.body.items) ? req.body.items : []) : []

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)
        // タイプチェック
        if (checkObject.type !== cmn.SUBGROUP_OTYPE) {
          json.code = 400
          throw new Error('not subgroup object')
        }
        // オブジェクト管理者チェック
        await apUti.checkObjectAdmin(json, _group, checkObject)

        // グループ管理者チェック
        const isGroupAdmin = await ckUti.checkGroupAdmin(_group)
        if (!isGroupAdmin) { // グループ管理者でなければ
          // 管理者を削除していないか管理者権限を変えてないかチェック
          for (let beforMember of checkObject.members) {
            const afterMember = items.find(m => m.oid === beforMember.oid)
            if (beforMember.role === cmn.ADMIN_ROLE) {
              if (!afterMember) {
                json.code = 400
                throw new Error('failed admin role action')
              }
            }
            if (afterMember &&  beforMember.role !== afterMember.role) {
              json.code = 400
              throw new Error('failed admin role action')
            }
          }
        }

        // メンバーチェック
        const oidArray = []
        items.map(m => oidArray.push(m.oid))
        // oidArrayチェック
        await apUti.checkOidArray(json, gid, oidArray)

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        const _members = []
        const _items = []
        for (let item of items) {
          if (item.role) {
            _members.push({ oid:item.oid, role:item.role }) // メンバー
          }
          _items.push({ oid:item.oid })
        }

        // オブジェクト取得
        const setObject = await Objects.findOne({ gid:gid, oid:oid }).session(session)
        setObject.members = _members
        setObject.items = _items
        setObject.utime = ntime
        // オブジェクト更新
        const updateObject = await setObject.save({ session:session })
        if (!updateObject) {
          throw new Error('failed update object')
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // resオブジェクトセット
        await obUti.setResObject([updateObject])
        json.object = updateObject

        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, updateObject, cmn.UPDATE_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// グループ参加
router.post('/join', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const amid = ckUti.checkId(req.body.amid) ? req.body.amid : ''
        const name = ckUti.checkStr(req.body.name) ? req.body.name : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!amid || !name) {
          json.code = 400
          throw new Error('invalid post')
        }

        // amidチェック
        const checkAddmember = await apUti.checkAmid(json, amid)
        // 名前チェック
        apUti.checkStrLength(json, name, 25, 'name')

        let checkMail = ''
        let checkPmid = ''
        // メールアドレスチェック
        if (ckUti.checkMail(checkAddmember.sendid)) {
          checkMail = checkAddmember.sendid
        } else {
          // PIDチェック
          if (ckUti.checkPid(checkAddmember.sendid)) {
            checkPmid = checkAddmember.sendid
          }
        }

        // グループ取得
        const checkModeGroup = await Groups.findById(checkAddmember.gid).select('gid mode')
        // グループモードチェック
        if (checkModeGroup.mode === cmn.MYGROUP_GMODE) { // マイグループなら
          json.code = 400
          throw new Error('invalid group mode mygroup')
        }

        // グループ参加済みチェック
        if (checkAddmember.status === cmn.JOIN_AMSTATUS || cmn.getAccountGroup(req, checkModeGroup.gid)) {
          // グループに参加済み
          json.code = 400
          throw new Error('failed join')
        }

        // 送信IDチェック

        if (checkMail) {
          // ログイン中アカウントの登録メール一致するかチェック
          if (checkMail !== req.session.account.mail) {
            // ログイン中のアカウントと招待されたメールアドレスが一致しない
            json.code = 400
            throw new Error('failed join')
          }
        }

        if (checkPmid) {
          // ログイン中のアカウントpmidのメンバーがいてるかチェック
          const midArray = []
          req.session.account.groups.map(g => midArray.push(g.mid))
          const checkMembers = await Members.find({ mid:{ $in: midArray } }).select('pmid')
          if (!checkMembers.find(m => m.pmid === checkPmid)) {
            // ログイン中のアカウントに招待されたメンバーはいない
            json.code = 400
            throw new Error('failed join')
          }
        }

        try {
          // メンバー数チェック
          await apUti.checkMemberCount(json, checkModeGroup.gid)
        } catch(err) {
          json.errors.result = `このグループは最大メンバー数を超えている為、参加できません`
          throw new Error('max member count over')
        }

        /*--------------------------------------------------*/
        
        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // ObjectId手動生成
        const _mmid = new mongoose.Types.ObjectId
        const _moid = new mongoose.Types.ObjectId
        const _mid = new mongoose.Types.ObjectId
        const mmid = String(_mmid)
        const moid = String(_moid)
        const mid = String(_mid)

        const setAddmember = await Addmembers.findById(amid).session(session)

        // メンバー公開ID生成
        const pmid = await apUti.generatePid(session)

        // グループ取得
        const checkGroup = await Groups.findById(setAddmember.gid).select('gid goid mode').session(session)
        const gid = checkGroup.gid
        const goid = checkGroup.goid

        // 公開
        const pub = (checkGroup.mode !== cmn.GROUPWARE_GMODE) ? true : false

        // メンバーオブジェクト作成
        const newMemberObjects = await Objects.create(
          [{
            _id: _moid,
            gid: gid,
            oid: moid,
            status: cmn.NORMAL_OSTATUS,
            nstatus: cmn.NORMAL_ONSTATUS,
            ntext: '',
            type: cmn.MEMBER_OTYPE,
            image: '',
            icon: '',
            name: name,
            data: { profile:'' },
            members: [],
            items: [],
            messages: [],
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newMemberObjects) {
          throw new Error('failed create member object')
        }
        const newMemberObject = newMemberObjects[0]

        // メンバー作成
        const newMember = await Members.create(
          [{
            _id: _mmid,
            gid: gid,
            mid: mmid,
            moid: moid,
            pmid: pmid,
            dmmode: cmn.ALL_DMMODE,
            settings: {},
            chtime: ntime,
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!newMember) {
          throw new Error('failed create member')
        }
        
        // グループオブジェクト取得
        const setGroupObject = await Objects.findOne({ gid:gid, oid:goid }).session(session)
        // グループオブジェクトにメンバー追加
        setGroupObject.members.push({
          role: cmn.USER_ROLE, // 一般
          oid: moid,
        })
        setGroupObject.utime = ntime
        // グループオブジェクト更新
        const updateGroupObject = await setGroupObject.save({ session:session })
        if (!updateGroupObject) {
          throw new Error('failed update group object')
        }
        
        // アカウント取得
        const setAccount = await Accounts.findById(req.session.account.aid).session(session)
        // アカウントにグループ追加
        setAccount.groups.push({
          gid: gid,
          goid: goid,
          mid: mmid,
          moid: moid,
        })
        setAccount.utime = ntime
        // アカウント更新
        const updateAccount = await setAccount.save({ session:session })
        if (!updateAccount) {
          throw new Error('failed update account')
        }

        // メンバー追加更新
        setAddmember.status = cmn.JOIN_AMSTATUS
        setAddmember.moid = moid
        setAddmember.name = name
        setAddmember.ctime = ntime
        const updateAddmember = await setAddmember.save({ session:session })
        if (!updateAddmember) {
          throw new Error('failed update add member')
        }

        const groupData = { oid:setGroupObject.oid, icon:setGroupObject.icon, name:setGroupObject.name }
        const memberData = { oid:moid, icon:'', name:name }

        const groupName = groupData.name
        const memberName = memberData.name
        // 絵文字対応するため文字配列にする
        const groupNameAry = [...groupName]
        const memberNameAry = [...memberName]

        const titleStr = `${groupName}に参加しました`

        // 参加メッセージ作成
        const newMessages = await Messages.create(
          [{
            _id: _mid,
            gid: gid,
            mid: mid,
            mkey: cmn.generateReverseObjectId(),
            type: cmn.MESSAGE_MTYPE,
            status: cmn.NOMAL_MSTATSU,
            pub: pub,
            wgid: gid,
            wmoid: moid,
            stext: titleStr,
            pmode: cmn.ALL_PMODE,
            members: [goid],
            objects: [moid, goid],
            title: titleStr,
            text: `${groupName}${memberName} が参加しました。`,
            blocks: [
              { offset:0, len:groupNameAry.length, entities:[{type: setGroupObject.type, offset:0, len:groupNameAry.length, data:groupData}] },
              { offset:groupNameAry.length, len:memberNameAry.length + ` が参加しました。`.length, entities:[{type: cmn.MEMBER_OTYPE, offset:0, len:memberNameAry.length, data:memberData}] },
            ],
            ctime: ntime,
            etime: ntime,
            htime: ntime,
            utime: ntime,
          }],
          { session:session })
        if (!newMessages) {
          throw new Error('failed create message')
        }
        const newMessage = newMessages[0]
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        // ログインセッションセット
        await apUti.setLoginSession(req, res, updateAccount)
        
        json.account = req.session.account
        
        // オブジェクトポーリングデータセット
        cache.setObjectPollingData(gid, newMemberObject, cmn.NEW_PTYPE, goid)
        // メッセージポーリングデータセット
        cache.setMessagePollingData(newMessage, cmn.NEW_PTYPE)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// お気に入り追加
router.post('/star/add', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!moid || !oid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属メンバーチェック
        const _group = apUti.checkBelongMember(req, json, moid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, '', oid)
        // タイプチェック
        if (checkObject.type !== cmn.MEMBER_OTYPE) { // メンバー以外
          json.code = 400
          throw new Error('invalid member object')
        }
        if (checkObject.oid === _group.moid) { // オブジェクトが自分かチェック
          json.code = 400
          throw new Error('invalid member object')
        }
        // グループ取得
        await apUti.checkGid(json, checkObject.gid)
        // お気に入り登録者数チェック
        await apUti.checkStarEntryCount(json, _group.gid, _group.moid)

        const tgid = checkObject.gid
        const type = checkObject.type

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        const result = { star:true, scount:checkObject.scount, isUpdate:false }

        // お気に入り取得
        const checkStar = await Stars.findOne({ gid:_group.gid, moid:_group.moid, tgid:tgid, toid:oid }).select('_id').session(session)
        if (!checkStar) {
          
          // グループ取得
          const checkGroup = await Groups.findById(tgid).select('goid').session(session)
          // グループオブジェクト取得
          const checkGroupObject = await Objects.findById(checkGroup.goid).select('type').session(session)

          // お気に入りグループ取得
          const setGroupStar = await Stars.findOne({ gid:_group.gid, moid:_group.moid, tgid:tgid, toid:checkGroup.goid }).session(session)
          if (setGroupStar) {
            // お気に入りグループが上に表示されるように更新時間を上げる
            setGroupStar.utime = ntime
            // お気に入りグループ更新
            const updateGroupStar = await setGroupStar.save({ session:session })
            if (!updateGroupStar) {
              throw new Error('failed update group star')
            }
          } else { // 無ければ

            // グループもお気に入り作成
            const newGroupStars = await Stars.create(
              [{
                _id: new mongoose.Types.ObjectId, // ObjectId手動生成
                gid: _group.gid,
                moid: _group.moid,
                tgid: tgid,
                toid: checkGroup.goid,
                type: checkGroupObject.type,
                ctime: ntime,
                utime: ntime,
              }],
              { session:session }
            )
            if (!newGroupStars) {
              throw new Error('failed create group star')
            }
          }

          // お気に入り作成
          const newStars = await Stars.create(
            [{
              _id: new mongoose.Types.ObjectId, // ObjectId手動生成
              gid: _group.gid,
              moid: _group.moid,
              tgid: tgid,
              toid: oid,
              type: type,
              ctime: ntime,
              utime: ntime,
            }],
            { session:session }
          )
          if (!newStars) {
            throw new Error('failed create star')
          }

          // メンバーお気に入り数セット
          await gpUti.setMemberStarCount(_group.gid, _group.moid, session, 1, ntime)
          // オブジェクトお気に入り数セット
          result.scount = await gpUti.setObjectStarCount(tgid, oid, session, 1, ntime)
          result.isUpdate = true
        }

        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        json.result = result
        
        // 現在違うブラウザで開いている場合のメンバー情報の更新はサポートしない(ブラウザを更新するれば変わる為)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

// お気に入り削除
router.post('/star/remove', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!moid || !oid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属メンバーチェック
        const _group = apUti.checkBelongMember(req, json, moid)

        /*--------------------------------------------------*/

        const _session = await db.startSession()
        if (_session) {
          // トランザクション開始
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        const result = { star:false, scount:0, isUpdate:false }

        // お気に入り取得
        let setStar = await Stars.findOne({ gid:_group.gid, moid:_group.moid, toid:oid }).session(session)
        if (setStar) {

          const tgid = setStar.tgid

          // お気に入り削除
          const deleteStar = await setStar.deleteOne({ session:session })
          if (!deleteStar) {
            throw new Error('failed delete star')
          }

          // グループ取得
          const checkGroup = await Groups.findById(tgid).select('goid').session(session)
          if (checkGroup) {
            // お気に入り取得
            const setGroupStar = await Stars.findOne({ gid:_group.gid, moid:_group.moid, tgid:tgid, toid:checkGroup.goid }).session(session)
            if (setGroupStar) {
              // お気に入り取得
              const checkStars = await Stars.find({ gid:_group.gid, moid:_group.moid, tgid:tgid, type:cmn.MEMBER_OTYPE }).session(session)
              if (checkStars && checkStars.length === 0) { // グループのお気に入りが無ければ
                const deleteGroupStar = await setGroupStar.deleteOne({ session:session })
                if (!deleteGroupStar) {
                  throw new Error('failed delete group star')
                }
              }
            }
          }

          // メンバーお気に入り数セット
          await gpUti.setMemberStarCount(_group.gid, _group.moid, session, -1, ntime)
          // オブジェクトお気に入り数セット
          result.scount = await gpUti.setObjectStarCount(tgid, oid, session, -1, ntime)
          result.isUpdate = true
        }

        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.result = result
        
        // 現在違うブラウザで開いている場合のメンバー情報の更新はサポートしない(ブラウザを更新するれば変わる為)
      } catch(err) {
        // ロールバック
        if (session) await session.abortTransaction()
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  }
})

//#endregion

/*--------------------------------------------------*/

module.exports = router

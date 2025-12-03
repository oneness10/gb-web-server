const cmn = require('../common')
const cache = require('../cache')
const chat = require('../chat')
const ckUti = require('../check-util')
const apUti = require('../api-util')
const gpUti = require('../group-util')
const msUti = require('../message-util')
const cmUti = require('../comment-util')
const scUti = require('../schedule-util')
const dbUti = require('../db-util')
const dtUti = require('../datetime-util')

const express = require('express')
const router = express.Router()

// MongoDB
const mongoose = require('mongoose')
const db = mongoose.connection

// スキーマ
const Messages = require('../schema/messages')
const Comments = require('../schema/comments')
const Schedules = require('../schema/schedules')

/*--------------------------------------------------*/
//#region GET

// 参照メッセージセット
const _setRefMessage = (messages, sgid, groupOidArray) => {
  
  for (let message of messages) {

    let _message = message
    if ('_doc' in message) _message = message._doc

    _message.rst = cmn.NONE_RSTATUS // 参照状態

    if (_message.type === cmn.REPOST_MTYPE || _message.type === cmn.REF_MTYPE) {
      // _message.gid = _message.rgid // セットしない
      // _message.mid = _message.rmid // セットしない
      // _message.wgid = _message.rwgid // セットしない
      // _message.wmoid = _message.rwmoid // セットしない
      
      if ('rmsg' in _message && _message.rmsg.length === 1) {
        const rmsg = _message.rmsg[0]

        //_message.type = rmsg.type // タイプはセットしない
        //_message.status = rmsg.status // 状況はセットしない
        _message.pmode = rmsg.pmode
        
        if (
          (rmsg.gid === sgid && groupOidArray.find(oid => rmsg.members.includes(oid))) || // 選択グループでmembersに含まれ表示できる
          (rmsg.gid !== sgid && rmsg.pmode === cmn.ALL_PMODE) // グループ外で全て公開モード
        ) {
          _message.rst = cmn.NORMAL_RSTATUS // 参照状態通常
          
          _message.mkey = rmsg.mkey
          _message.pub = rmsg.pub
          _message.objects = rmsg.objects
          _message.sid = rmsg.sid
          _message.soid = rmsg.soid
          _message.sdata = rmsg.sdata
          _message.title = rmsg.title
          _message.text = rmsg.text
          _message.blocks = rmsg.blocks
          _message.images = rmsg.images
          _message.files = rmsg.files
          _message.okcount = rmsg.okcount
          _message.okmembers = rmsg.okmembers
          _message.ccount = rmsg.ccount
          _message.allccount = rmsg.allccount
          _message.rpcount = rmsg.rpcount
          _message.ctime = rmsg.ctime
          _message.etime = rmsg.etime
          _message.utime = rmsg.utime
        } else {
          _message.rst = cmn.NOTVIEW_RSTATUS // 参照状態表示できない
          // メッセージ情報クリア
          msUti.clearMessageInfo(_message)
        }
      } else {
        _message.rst = cmn.DELETE_RSTATUS // 参照状態削除
        // メッセージ情報クリア
        msUti.clearMessageInfo(_message)
      }
    }
  }
}

// 参照メッセージ結合取得
const _getRefMessageLookup = () => {
  return {
    $lookup: {
      from: 'messages',
      let: {
        local_rgid:'$rgid',
        local_rmid:'$rmid',
      },
      pipeline: [
        { $match: {
            $expr: {
              $and: [
                { $ne: ['$$local_rgid', ''] },
                { $ne: ['$$local_rmid', ''] },
                { $eq: ['$$local_rgid', '$gid'] },
                { $eq: ['$$local_rmid', '$mid'] },
              ]
            },
          }
        },
        { $project: { _id:0, stext:0 } },
      ],
      as: 'rmsg',
    }
  }
}

/*--------------------------------------------------*/

// 検索
router.get('/search', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
        const text = ckUti.checkStr(req.query.text) ? req.query.text : ''
        const page = ckUti.checkStrNumber(req.query.p) ? req.query.p : ''

        const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
        
        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !text || !page) {
          json.code = 400
          throw new Error('invalid get')
        }

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // 検索文字チェック
        apUti.checkStrLength(json, text, 20, 'text')
        
        /*--------------------------------------------------*/

        // 検索
        const search = {
          index: 'default',
          compound: {
            must: []
          }
        }

        // 検索文字を空白分割して配列に
        let textArray = text.replace(/　/g, ' ').trim().split(' ')
        textArray = textArray.filter(t => { return (t) })

        // AND検索
        for (let t of textArray) {
          search.compound.must.push({
            text: {
              query: t,
              path: {
                wildcard: '*'
              },
              matchCriteria: 'all', // フィールドのすべてのタームを含むドキュメントのみを返す
            },
          })
        }

        // グループの関連oid配列取得
        const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)

        // 検索条件
        const find = { 
          gid: sgid,
          rgid: '',
          type: cmn.MESSAGE_MTYPE,
          members: (groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray }
        }
        // 指定列
        const project = { _id:0, stext:0, members:0 } // _id, メンバーはselectしない
        // 並び順
        const sort = { ctime:-1 }
        // ページ
        const numberPage = parseInt(page)
        
        // スキップ
        let skip = (numberPage * cmn.MESSAGE_READ_LIMIT)
        if (skip < 0) skip = 0

        // メッセージ取得、メッセージタイプならOKコメント結合、ホームならグループ内部結合
        const aggregateAry = [
          { $search: search },
          { $match: find }, 
          { $project: project },
          { $sort: sort },
          { $limit: cmn.MESSAGE_READ_LIMIT + skip },
          { $skip: skip },
        ]
        const messages = await Messages.aggregate(aggregateAry)
        if (messages) {
          // 参照メッセージセット
          _setRefMessage(messages, sgid, groupOidArray)
          // resメッセージセット
          await msUti.setResMessage(req, messages, sgid, _group)
          json.messages = messages
        } else {
          throw new Error('failed search messages')
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

// 一覧取得
router.get('/list', (req, res, next) => {

  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const soid = ckUti.checkId(req.query.soid) ? req.query.soid : '' // 選択oid
      const viewType = ckUti.checkStrLength(req.query.v, 1) ? req.query.v : ''
      const page = ckUti.checkStrNumber(req.query.p) ? req.query.p : ''

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
      const offsetPlus = ckUti.checkStrNumber(req.query.op) ? req.query.op : '0'
      const offsetMinus = ckUti.checkStrNumber(req.query.om) ? req.query.om : '0'
      const home = ckUti.checkStr(req.query.h) ? req.query.h : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sgid || !soid || !viewType || !page) {
        json.code = 400
        throw new Error('invalid get')
      }

      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)
      
      // oidチェック
      const checkObject = await apUti.checkOid(json, sgid, soid)
      // テキストオブジェクトタイプチェック
      apUti.checkTextObjectType(json, checkObject.type)

      // 表示タイプチェック
      if (
        (viewType !== cmn.MESSAGE_MVTYPE) &&
        (viewType !== cmn.IMAGE_MVTYPE) &&
        (viewType !== cmn.FILE_MVTYPE)
      ) {
        json.code = 400
        throw new Error('invalid view type')
      }

      /*--------------------------------------------------*/

      // グループの関連oid配列取得
      const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)

      // 検索条件
      let find = { 
        gid: sgid,
        rgid: '',
        type: cmn.MESSAGE_MTYPE,
        members: (groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray }
      }
      // 指定列
      const project = { _id:0, stext:0, members:0 } // _id, stext, membersはselectしない
      // 並び順
      let sort = {}
      // ページ
      const numberPage = parseInt(page)
      // オフセット
      const numberOffsetPlus = parseInt(offsetPlus)
      const numberOffsetMinus = parseInt(offsetMinus)
      // ホーム
      const isHome = (home === '1' && (_group && _group.moid === soid)) ? true : false
      
      if (isHome && viewType === cmn.MESSAGE_MVTYPE) {
        // ホームメッセージ表示
        find = {
          $or: [
            { // 通常メッセージ、ダイレクトメッセージ
              rgid: '',
              members: (groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray },
              objects: (groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray },
            },
            {
              rgid: { $ne:'' },
              wgid: _group.gid,
              wmoid: _group.moid,
              type: { $ne:cmn.REPOST_MTYPE },
            },
          ],
        }
      } else if (checkObject.type === cmn.GGROUP_OTYPE || checkObject.type === cmn.HGROUP_OTYPE) { 
        // グループ
      } else if (checkObject.type === cmn.SUBGROUP_OTYPE) {
        // サブグループ
        const itemOids = [soid]
        // メンバー以外のitemsを追加
        for (let item of checkObject.items) {
          if (!checkObject.members.find(m => m.oid === item.oid))
            itemOids.push(item.oid)
        }
        find['objects'] = { $in: itemOids } // (objects IN itemOids)
      } else if (checkObject.type === cmn.MEMBER_OTYPE && viewType === cmn.MESSAGE_MVTYPE) {
        // メンバーメッセージ表示
        find = {
          wgid: sgid,
          wmoid: soid,
          $or: [
            { // 通常メッセージ
              rgid: '',
              type: cmn.MESSAGE_MTYPE,
              members: (groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray },
            },
            {
              // 再投稿
              rgid: { $ne:'' },
              type: cmn.REPOST_MTYPE,
            },
          ],
        }
      } else if (checkObject.type === cmn.MEMBER_OTYPE && viewType !== cmn.MESSAGE_MVTYPE) {
        // メンバーメッセージ表示以外
        find['wgid'] = sgid
        find['wmoid'] = soid
      } else if (checkObject.type === cmn.TOPIC_OTYPE) {
        // 話題
        find['objects'] = soid
      }

      // 画像表示、ファイル表示
      if (viewType === cmn.IMAGE_MVTYPE) {
        find['images.0'] = { $exists:true }
      } else if (viewType === cmn.FILE_MVTYPE) {
        find['files.0'] = { $exists:true }
      }

      // 並び順セット
      if (home === '1') {
        // ホームの場合、ホーム時間順
        sort = { htime:-1, ctime:-1 }
      } else [
        // ホームで無い場合、登録時間順
        sort = { ctime:-1 }
      ]

      // スキップ
      let skip = (numberPage * cmn.MESSAGE_READ_LIMIT) + numberOffsetPlus - numberOffsetMinus
      if (skip < 0) skip = 0

      // チェックメッセージ
      const checkMessage = (numberPage > 0 && skip > 0) ? 1 : 0

      // メッセージ取得、メッセージタイプならOKコメント結合、ホームならグループ内部結合
      const aggregateAry = [
        { $match: find }, 
        { $project: project },
        { $sort: sort },
        { $limit: cmn.MESSAGE_READ_LIMIT + skip },
        { $skip: skip - checkMessage },
      ]
      if (viewType === cmn.MESSAGE_MVTYPE & (isHome || checkObject.type === cmn.MEMBER_OTYPE)) { // メッセージ表示、ホームかメンバー
        aggregateAry.push(_getRefMessageLookup()) // 参照メッセージ結合
      }
      const messages = await Messages.aggregate(aggregateAry)
      if (messages) {
        // 参照メッセージセット
        _setRefMessage(messages, sgid, groupOidArray)
        // resメッセージセット
        await msUti.setResMessage(req, messages, sgid, _group)
        json.messages = messages
        // チェックメッセージのデータはmidだけにする
        if (json.messages.length > 0 && checkMessage === 1) {
          json.messages[0] = { mid:json.messages[0].mid } 
        }
      } else {
        throw new Error('failed list messages')
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

// ホームチェック取得
router.get('/checkhome', (req, res, next) => {

  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const gid = ckUti.checkId(req.query.gid) ? req.query.gid : ''
      const time = ckUti.checkStrNumber(req.query.t) ? req.query.t : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!gid || !time) {
        json.code = 400
        throw new Error('invalid get')
      }

      // 所属グループチェック
      const _group = apUti.checkBelongGroup(req, json, gid)
      
      /*--------------------------------------------------*/

      // グループの関連oid配列取得
      const groupOidArray = await apUti.getGroupOidArray(req, gid, _group)
      // 時間
      const numberTime = parseInt(time)

      // 検索条件
      find = {
        $or: [
          { // 通常メッセージ、ダイレクトメッセージ
            rgid: '',
            members: (groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray },
            objects: (groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray },
          },
          {
            rgid: { $ne:'' },
            wgid: _group.gid,
            wmoid: _group.moid,
            type: { $ne:cmn.REPOST_MTYPE },
          },
        ],
        htime:{ $gt:numberTime }
      }
      
      // メッセージ取得
      const aggregateAry = [
        { $match: find }, 
        { $project: { mid:1 } },
        { $limit: 1 },
      ]
      const messages = await Messages.aggregate(aggregateAry)
      if (messages) {
        json.home = (messages.length > 0) ? true : false
      } else {
        throw new Error('failed check home')
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

// 個別取得(参照メッセージはエラー)
router.get('/', (req, res, next) => {
    
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
      const mid = ckUti.checkId(req.query.mid) ? req.query.mid : ''
      const dmoid = ckUti.checkId(req.query.dmoid) ? req.query.dmoid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (
        (!sgid) ||
        (!dmoid && !mid) || 
        (dmoid && (!moid || mid))
      ) {
        json.code = 400
        throw new Error('invalid get')
      }

      const isDirectMesage = (dmoid) ? true : false
      
      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

      /*--------------------------------------------------*/
      
      let find = {}
      if (!isDirectMesage) {
        find = { mid:mid }
      } else {
        find = {
          type:cmn.DM_MTYPE, 
          $or:[
            { 'objects.0':_group.moid, 'objects.1':dmoid },
            { 'objects.0':dmoid, 'objects.1':_group.moid }
          ]
        }
      }

      // メッセージ取得
      const aggregateAry = [
        { $match:find }, 
        { $project:{ _id:0, stext:0 } },
      ]
      const messages = await Messages.aggregate(aggregateAry)
      if (messages) {
        if (messages.length === 1) {
          const message = messages[0]

          if (message.type !== cmn.REPOST_MTYPE) { // 再投稿以外
            if (!isDirectMesage) {
              // メッセージ表示チェック
              await apUti.checkMessageView(req, json, message, _group)
            } else {
              // ダイレクトメッセージ表示チェック
              apUti.checkDirectMessageView(json, message, _group.moid, dmoid)
            }
          } else {
            // 再投稿
            const refMessage = await Messages.findById(message.rmid)
            message.rmsg = [refMessage]
            // グループの関連oid配列取得
            const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)
            // 参照メッセージセット
            _setRefMessage([message], sgid, groupOidArray)
          }

          // resメッセージセット
          await msUti.setResMessage(req, [message], sgid, _group)
          json.message = message
        } else {
          json.message = null
        }
      } else {
        throw new Error('failed message')
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

//#endregion

/*--------------------------------------------------*/
//#region POST

// 新規、編集
router.post('/', (req, res, next) => {
  // ログイン、トークンチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''
        const sid = ckUti.checkId(req.body.sid) ? req.body.sid : ''
        const pmode = ckUti.checkNumber(req.body.pmode) ? req.body.pmode : 0
        const title = ckUti.checkStr(req.body.title) ? req.body.title : ''
        const content = (req.body.content) ? req.body.content : null
        const images = (req.body.images) ? (Array.isArray(req.body.images) ? req.body.images : []) : []

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !pmode || !content) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        
        const beforOidSet = new Set()

        let checkMessage = null
        
        if (mid === '') {
          // 新規

          // スケジュール
          if (sid !== '') {
            // sidチェック
            const checkSchedule = await apUti.checkSid(json, sid)
            // スケジュール表示チェック
            await apUti.checkScheduleView(req, json, checkSchedule, _group)
            // oidチェック
            const checkObject = await apUti.checkOid(json, gid, checkSchedule.oid)
            // スケジュール編集チェック
            await apUti.checkScheduleEdit(json, _group, checkObject, checkSchedule)
            // 作成者チェック
            if (checkSchedule.wmoid !== _group.moid) { // スケジュールの作者が自分かチェック
              json.code = 400
              throw new Error('invalid schedule writer')
            }
          }
        } else {
          // 編集

          // midチェック(ブロック、画像・ファイルあり)
          checkMessage = await apUti.checkMid(json, mid, true, 'blocks images files')
          // メッセージ表示チェック
          await apUti.checkMessageView(req, json, checkMessage, _group)
          // メッセージ作成者チェック
          apUti.checkMessageAuthor(json, checkMessage, _group)

          // 前回oid配列セット
          for (let block of checkMessage.blocks) {
            for (let entity of block.entities) {
              // テキストオブジェクトタイプチェック
              apUti.checkTextObjectType(json, entity.type)
              // oid追加
              beforOidSet.add(entity.data.get('oid'))
            }
          }
        }

        // pmodeチェック
        if (
          (pmode !== cmn.ALL_PMODE && pmode !== cmn.MEMBER_PMODE && pmode !== cmn.SELF_PMODE) ||
          (_group.mode === cmn.HOMEPAGE_GMODE && pmode === cmn.MEMBER_PMODE) // ホームページモード&公開モードが関連メンバー
        ) {
          json.code = 400
          throw new Error('invalid pmode')
        }

        if (title) {
          // titleチェック
          apUti.checkStrLength(json, title, 50, 'title')
        }

        // 文字数取得
        const count = msUti.getStrCount(content)
        // 文字数チェック
        if (count === 0) {
          json.code = 400
          throw new Error('not content')
        }
        if (count > cmn.EDITOR_STR_LIMIT) {
          json.code = 400
          throw new Error('str limit over')
        }

        // 画像チェック
        if (images.length > cmn.MESSAGE_IMAGE_MAX_SIZE) {
          json.code = 400
          throw new Error('over mesage image size')
        }

        const oidArray = []
        const files = []
        
        // エンティティチェック
        for (let i = 0; i < content.blocks.length; i++) {
          const block = content.blocks[i]
          
          for (let entity of block.entityRanges) {

            const entityMap = content.entityMap[entity.key]
            
            const type = Number(entityMap.type)
            // テキストオブジェクトタイプチェック
            apUti.checkTextObjectType(json, type)
              
            if (type === 0) {
              json.code = 400
              throw new Error(`failed entiry type ${entityMap.type}`)
            }

            if (type === cmn.FILE_OTYPE) {
              // ファイル
              files.push({
                fname: entityMap.data.fname,
                type: cmn.FILE_FTYPE,
                data: { name:entityMap.data.name, desc:'' }
              })
            } else {
              // oid追加
              oidArray.push(entityMap.data.oid)
            }
          }
        }
        
        if (mid && beforOidSet.size > 0) {
          // 編集時は追加されたオブジェクトのみチェックするようにする
          for (let beforOid of beforOidSet) {
            oidArray.splice(0, oidArray.length, ...oidArray.filter(oid => { return oid !== beforOid }))
          }
        }
        
        // oidArrayチェック
        if (oidArray.length > 0) {
          await apUti.checkOidArray(json, gid, oidArray)
        }

        // 画像チェック
        msUti.checkImages(json, (checkMessage) ? checkMessage.images : [], images)
        // ファイルチェック
        msUti.checkFiles(json, (checkMessage) ? checkMessage.files : [], files)
        
        /*--------------------------------------------------*/
        
        // トランザクション開始
        const _session = await db.startSession()
        if (_session) {
          session = _session
          session.startTransaction()
        } else {
          throw new Error('failed start session')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        // 画像・ファイルサイズ初期化
        images.map(i => i.size = 0)
        files.map(f => f.size = 0)

        if (mid === '') {
          // 新規
          
          /*--------------------------------------------------*/

          // ObjectId手動生成
          const _mid = new mongoose.Types.ObjectId
          const mid = String(_mid)

          const mkey = cmn.generateReverseObjectId()

          // 公開
          const pub = (_group.mode !== cmn.GROUPWARE_GMODE) ? true : false

          // コンテンツセット
          const textBlocksMap = msUti.setTextBlocks(content)
          
          // 一時画像
          const tempImages = msUti.getNewFiles([], images)
          // 一時ファイル
          const tempFiles = msUti.getNewFiles([], files)

          // 画像セット
          await msUti.setImages(mkey, [], images)
          // ファイルセット
          await msUti.setFiles(mkey, [], files, textBlocksMap.blocks)
          
          /*--------------------------------------------------*/

          // wmoidを関連オブジェクトに追加
          if (textBlocksMap.objects.indexOf(_group.moid) === -1) {
            // 関連オブジェクトにwmoid挿入
            textBlocksMap.objects = [_group.moid, ...textBlocksMap.objects]
          }

          // 関連メンバーを作成
          let members = []
          if (pmode === cmn.ALL_PMODE) {
            // goidのみ
            members.push(_group.goid)
          } else if (pmode === cmn.MEMBER_PMODE) {
            // 関連オブジェクト
            members = [...textBlocksMap.objects]
          } else if (pmode === cmn.SELF_PMODE) {
            // wmoidのみ
            members.push(_group.moid)
          }

          // 検索テキスト
          let stext = msUti.getStext(title, '')

          // スケジュール
          let soid = ''
          let sdata = {}
          let updateSchedule = null
          if (sid !== '') {
            // スケジュール取得
            const setSchedule = await Schedules.findById(sid).session(session)

            // mid
            setSchedule.mid = mid
            // 関連メンバー
            setSchedule.members = members
            // 更新時間
            setSchedule.utime = ntime

            soid = setSchedule.oid

            sdata = {
              text: `${scUti.getScheuleMonthDateTimeStr(setSchedule)} ${setSchedule.title}`,
              ymd: setSchedule.ymd,
              color: setSchedule.color,
            }

            // 検索テキスト
            stext = msUti.getStext(title, setSchedule.title)

            // スケジュールoidを関連オブジェクトに追加
            if (textBlocksMap.objects.indexOf(setSchedule.oid) === -1) {
              // 関連オブジェクトにスケジュールoid挿入
              textBlocksMap.objects = [...textBlocksMap.objects, setSchedule.oid]
            }

            // スケジュール更新
            updateSchedule = await setSchedule.save({ session:session })
            if (!updateSchedule) {
              throw new Error('failed update schedule')
            }
          }

          // 追加サイズセット
          let addSize = 0
          //images.map(i => addSize += i.size) // 画像は含めない
          files.map(f => addSize += f.size)
          
          // メッセージ作成
          const message = await Messages.create(
            [{
              _id: _mid,
              gid: gid,
              mid: mid,
              mkey: mkey,
              type: cmn.MESSAGE_MTYPE,
              status: cmn.NOMAL_MSTATSU,
              pub: pub,
              wgid: _group.gid,
              wmoid: _group.moid,
              stext: stext,
              pmode: pmode,
              members: members,
              objects: textBlocksMap.objects,
              sid: sid,
              soid: soid,
              sdata: sdata,
              title: title,
              text: textBlocksMap.text,
              blocks: textBlocksMap.blocks,
              images: images,
              files: files,
              settings: [],
              ctime: ntime,
              etime: ntime,
              htime: ntime,
              utime: ntime,
            }],
            { session:session })
          if (!message) {
            throw new Error('failed create message')
          }
          const newMessage = message[0]

          // グループファイルサイズセット
          await gpUti.setGroupFilesize(gid, session, 0, addSize, ntime)

          /*--------------------------------------------------*/

          // トランザクションコミット
          await session.commitTransaction()
          await session.endSession()
          session = null

          // 一時画像削除
          await msUti.deleteImages(cmn.AWS_S3_TEMP_BUCKET, '', tempImages, [])
          // 一時ファイル削除
          await msUti.deleteFiles(cmn.AWS_S3_TEMP_BUCKET, '', tempFiles, [])

          // resメッセージセット
          await msUti.setResMessage(req, [newMessage], gid, _group)
          json.message = newMessage

          // メッセージポーリングデータセット
          cache.setMessagePollingData(newMessage, cmn.NEW_PTYPE)

          if (updateSchedule) { // スケジュールが更新されたら
            // resスケジュールセット
            await scUti.setResSchedule(req, [updateSchedule], gid)
            json.schedule = updateSchedule

            // スケジュールポーリングデータセット
            cache.setSchedulePollingData(updateSchedule, cmn.UPDATE_PTYPE)
          }
        } else {
          // 編集
          
          /*--------------------------------------------------*/
          
          // メッセージ取得
          const setMessage = await Messages.findById(mid).session(session)
          
          const newComments = []
          let allccount = setMessage.allccount

          // コンテンツセット
          const textBlocksMap = msUti.setTextBlocks(content)

          // 削除サイズセット
          let deleteSize = 0
          //message.images.map(i => deleteSize += i.size) // 画像は含めない
          setMessage.files.map(f => deleteSize += f.size)

          // 前回画像
          const beforImages = []
          setMessage.images.map(i => beforImages.push(i))
          // 前回ファイル
          const beforFiles = []
          setMessage.files.map(f => beforFiles.push(f))

          // 一時画像
          const tempImages = msUti.getNewFiles(beforImages, images)
          // 一時ファイル
          const tempFiles = msUti.getNewFiles(beforFiles, files)

          // 画像セット
          await msUti.setImages(setMessage.mkey, beforImages, images)
          // ファイルセット
          await msUti.setFiles(setMessage.mkey, beforFiles, files, textBlocksMap.blocks)

          // 前回から情報をセット
          for (let beforImage of beforImages) {
            for (let image of images) {
              if (image.fname === beforImage.fname) {
                image.type = beforImage.type
                image.size = beforImage.size
                image.data = beforImage.data
                break
              }
            }
          }
          for (let beforFile of beforFiles) {
            for (let file of files) {
              if (file.fname === beforFile.fname) {
                file.type = beforFile.type
                file.size = beforFile.size
                file.data = beforFile.data
                break
              }
            }
          }

          if (!((pmode === cmn.SELF_PMODE || setMessage.pmode === cmn.SELF_PMODE) && setMessage.allccount === 0)) { // 公開モードが自分のみ、自分のみからの変更でコメント数が0の場合は履歴は追加しない 

            /*--------------------------------------------------*/
            // 公開モード変更コメント

            if (setMessage.pmode !== pmode) {

              // ObjectId手動生成
              const _cid = new mongoose.Types.ObjectId
              const cid = String(_cid)

              const text = `${cmn.getPmodeName(setMessage.pmode)} ⇒ ${cmn.getPmodeName(pmode)}`

              // コメント作成
              const comment = await Comments.create(
                [{
                  _id: _cid,
                  gid: gid,
                  mid: mid,
                  cid: cid,
                  wgid: _group.gid,
                  wmoid: _group.moid,
                  type: cmn.P_EDIT_CTYPE,
                  text: text,
                  blocks: [{ offset:0, len:text.length, entities:[] }],
                  ctime: ntime,
                  utime: ntime,
                }],
                { session:session }
              )
              if (!comment) {
                throw new Error('failed create comment')
              }
              newComments.push(comment[0])
              
              allccount += 1
            }
            
            /*--------------------------------------------------*/
            // タイトル変更コメント

            const beforTitle = setMessage.title
            // 絵文字対応するため文字配列にする
            const beforTitleAry = [...beforTitle]
            const titleAry = [...title]

            if (setMessage.title !== title) {

              // ObjectId手動生成
              const _cid = new mongoose.Types.ObjectId
              const cid = String(_cid)

              // コメント作成
              const comment = await Comments.create(
                [{
                  _id: _cid,
                  gid: gid,
                  mid: mid,
                  cid: cid,
                  wgid: _group.gid,
                  wmoid: _group.moid,
                  type: cmn.T_EDIT_CTYPE,
                  text: `${beforTitle} ⇒ ${title}`,
                  blocks: [{ offset:0, len:beforTitleAry.length + ` ⇒ `.length + titleAry.length, entities:[] }],
                  ctime: ntime,
                  utime: ntime,
                }],
                { session:session }
              )
              if (!comment) {
                throw new Error('failed create comment')
              }
              newComments.push(comment[0])
              
              allccount += 1
            }
            
            /*--------------------------------------------------*/
            // 変更コメント
            
            if (setMessage.text !== textBlocksMap.text) {

              // ObjectId手動生成
              const _cid = new mongoose.Types.ObjectId
              const cid = String(_cid)

              // コメント作成
              const comment = await Comments.create(
                [{
                  _id: _cid,
                  gid: gid,
                  mid: mid,
                  cid: cid,
                  wgid: _group.gid,
                  wmoid: _group.moid,
                  type: cmn.EDIT_CTYPE,
                  text: setMessage.text,
                  blocks: setMessage.blocks,
                  ctime: ntime,
                  utime: ntime,
                }],
                { session:session }
              )
              if (!comment) {
                throw new Error('failed create comment')
              }
              newComments.push(comment[0])

              allccount += 1
            }

            /*--------------------------------------------------*/
            // 画像追加コメント

            // 画像追加チェック
            const _addImages = []
            for (let image of images) {
              let isExist = false
              for (let beforImage of beforImages) {
                if (beforImage.fname === image.fname) {
                  isExist = true
                  break
                }
              }
              if (isExist === false) _addImages.push(image)
            }
            
            if (_addImages.length > 0) {

              // ObjectId手動生成
              const _cid = new mongoose.Types.ObjectId
              const cid = String(_cid)

              // コメント作成
              const comment = await Comments.create(
                [{
                  _id: _cid,
                  gid: gid,
                  mid: mid,
                  cid: cid,
                  wgid: _group.gid,
                  wmoid: _group.moid,
                  type: cmn.I_ADD_CTYPE,
                  images: _addImages,
                  ctime: ntime,
                  utime: ntime,
                }],
                { session:session }
              )
              if (!comment) {
                throw new Error('failed create comment')
              }
              newComments.push(comment[0])

              allccount += 1
            }

            /*--------------------------------------------------*/
            // 画像削除コメント

            // 画像削除チェック
            const deleteImages = []
            for (let beforImage of beforImages) {
              let isExist = false
              for (let image of images) {
                if (image.fname === beforImage.fname) {
                  isExist = true
                  break
                }
              }
              if (isExist === false) deleteImages.push(beforImage)
            }
            
            if (deleteImages.length > 0) {

              // ObjectId手動生成
              const _cid = new mongoose.Types.ObjectId
              const cid = String(_cid)

              // コメント作成
              const comment = await Comments.create(
                [{
                  _id: _cid,
                  gid: gid,
                  mid: mid,
                  cid: cid,
                  wgid: _group.gid,
                  wmoid: _group.moid,
                  type: cmn.I_DELETE_CTYPE,
                  images: deleteImages,
                  ctime: ntime,
                  utime: ntime,
                }],
                { session:session }
              )
              if (!comment) {
                throw new Error('failed create comment')
              }
              newComments.push(comment[0])

              allccount += 1
            }
          }

          /*--------------------------------------------------*/
          // メッセージ変更

          // 追加サイズセット
          let addSize = 0
          //images.map(i => addSize += i.size) // 画像は含めない
          files.map(f => addSize += f.size)

          // wmoidを関連オブジェクトに追加
          if (textBlocksMap.objects.indexOf(setMessage.wmoid) === -1) {
            // 関連オブジェクトにwmoid挿入
            textBlocksMap.objects = [setMessage.wmoid, ...textBlocksMap.objects]
          }

          // 関連メンバーを作成
          let members = []
          if (pmode === cmn.ALL_PMODE) {
            // goidのみ
            members.push(_group.goid)
          } else if (pmode === cmn.MEMBER_PMODE) {
            // 関連オブジェクト
            members = [...textBlocksMap.objects]
          } else if (pmode === cmn.SELF_PMODE) {
            // wmoidのみ
            members.push(setMessage.wmoid)
          }

          // スケジュール
          if (setMessage.sid) {
            // スケジュール取得
            const checkSchedule = await Schedules.findById(setMessage.sid).select('oid').session(session)

            // スケジュールoidを関連オブジェクトに追加
            if (textBlocksMap.objects.indexOf(checkSchedule.oid) === -1) {
              // 関連オブジェクトにスケジュールoid挿入
              textBlocksMap.objects = [...textBlocksMap.objects, checkSchedule.oid]
            }
          }

          // 公開モードと編集時刻
          if (pmode !== cmn.SELF_PMODE) {
            if (setMessage.pmode === cmn.SELF_PMODE && setMessage.ctime === setMessage.etime) {
              setMessage.ctime = ntime
              setMessage.etime = ntime
            } else {
              setMessage.etime = ntime
            }
          } else if (setMessage.pmode !== cmn.SELF_PMODE) { // 自分のみ以外のモードから自分のみモードへ
            setMessage.etime = ntime
          }

          // 検索テキスト
          setMessage.stext = msUti.getStext(title, '')
          if (setMessage.sid !== '') {
            // スケジュール取得
            const checkSchedule = await Schedules.findById(setMessage.sid).session(session)
            // 検索テキスト
            setMessage.stext = msUti.getStext(title, checkSchedule.title)
          }

          // メッセージ変更
          setMessage.pmode = pmode
          setMessage.members = members
          setMessage.objects = textBlocksMap.objects
          setMessage.title = title
          setMessage.text = textBlocksMap.text,
          setMessage.blocks = textBlocksMap.blocks,
          setMessage.images = images
          setMessage.files = files
          setMessage.allccount = allccount
          setMessage.htime = ntime
          setMessage.utime = ntime

          // メッセージ更新
          const updateMessage = await setMessage.save({ session:session })
          if (!updateMessage) {
            throw new Error('failed update message')
          }

          // キャッシュのメッセージ削除
          await cache.deleteData(`msg:${mid}`)

          // スケジュール
          let updateSchedule = null
          if (setMessage.sid) {
            // スケジュール取得
            const setSchedule = await Schedules.findById(setMessage.sid).session(session)

            // 関連メンバー
            setSchedule.members = members
            // 更新時間
            setSchedule.utime = ntime

            // スケジュール更新
            updateSchedule = await setSchedule.save({ session:session })
            if (!updateSchedule) {
              throw new Error('failed update schedule')
            }
          }

          // グループファイルサイズセット
          await gpUti.setGroupFilesize(gid, session, deleteSize, addSize, ntime)

          // 参照メッセージがあれば削除
          const setRefMessage = await Messages.findOne({ wgid:_group.gid, wmoid:_group.moid, rmid:mid, type:cmn.REF_MTYPE }).session(session)
          if (setRefMessage) {
            // 参照メッセージ削除
            await dbUti.deleteMessage(setRefMessage, session)
          }

          /*--------------------------------------------------*/
          
          // トランザクションコミット
          await session.commitTransaction()
          await session.endSession()
          session = null

          // 一時画像削除
          await msUti.deleteImages(cmn.AWS_S3_TEMP_BUCKET, '', tempImages, [])
          // 一時ファイル削除
          await msUti.deleteFiles(cmn.AWS_S3_TEMP_BUCKET, '', tempFiles, [])
          // 画像削除(画像削除コメントで使用する為、削除しない)
          //await msUti.deleteImages(cmn.AWS_S3_IMAGES_BUCKET, message.mkey, beforImages, images)
          // ファイル削除
          await msUti.deleteFiles(cmn.AWS_S3_FILES_BUCKET, setMessage.mkey, beforFiles, files)

          // resメッセージセット
          await msUti.setResMessage(req, [updateMessage], gid, _group)
          json.message = updateMessage

          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)

          if (newComments.length > 0) {
            // resコメントセット
            await cmUti.setResComment(req, newComments, gid)
            json.comments = newComments
            for (let newComment of newComments) {
              // チャットコメントデータ送信
              chat.sendCommentData(newComment, cmn.NEW_PTYPE)
            }
          }
          if (updateSchedule) { // スケジュールが更新されたら
            // resスケジュールセット
            await scUti.setResSchedule(req, [updateSchedule], gid)
            json.schedule = updateSchedule

            // スケジュールポーリングデータセット
            cache.setSchedulePollingData(updateSchedule, cmn.UPDATE_PTYPE)
          }
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

// 削除
router.post('/delete', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !mid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)

        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)
        // メッセージ表示チェック
        await apUti.checkMessageView(req, json, checkMessage, _group)

        // 削除する権限をもっているかチェック
        let isDelete = false
        // 作成者チェック
        if (checkMessage.wgid === _group.gid && checkMessage.wmoid === _group.moid) { 
          isDelete = true
        }
        // システムメッセージチェック
        if (!isDelete && checkMessage.wmoid === cmn.SYSTEM_OID && checkMessage.members.find(oid => oid === _group.moid)) { // システムメッセージでメッセージの関連メンバーなら削除できる(自分自身がセットされている)
          isDelete = true
        }
        // グループ管理者チェック
        if (!isDelete && await ckUti.checkGroupAdmin(_group)) { 
          isDelete = true
        }
        if (!isDelete) {
          json.code = 400
          throw new Error("can't delete message")
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

        // メッセージ取得
        const setMessage = await Messages.findById(mid).session(session)

        const mkey = setMessage.mkey

        const beforMessageImages = []
        const beforMessageFiles = []
        const beforCommentImagesAry = []
        const beforCommentFilesAry = []
        
        let updateSchedule = null

        // 削除サイズセット
        let deleteSize = 0
        //message.images.map(i => deleteSize += i.size) // 画像は含めない
        setMessage.files.map(f => deleteSize += f.size)

        // 前回メッセージ画像
        setMessage.images.map(i => beforMessageImages.push(i))
        // 前回メッセージファイル
        setMessage.files.map(f => beforMessageFiles.push(f))
        
        /*--------------------------------------------------*/
        // スケジュール更新
        
        if (setMessage.sid) {
          // スケジュール取得
          const setSchedule = await Schedules.findById(setMessage.sid).session(session)

          // mid
          setSchedule.mid = ''
          
          // 関連メンバー
          let members = [setSchedule.wmoid]
          if (setSchedule.pmode === cmn.ALL_PMODE) {
            // goidのみ
            members = [_group.goid]
          }
          // 関連メンバー
          setSchedule.members = members
          // 更新時間
          setSchedule.utime = dtUti.getNowUtime()

          // スケジュール更新
          updateSchedule = await setSchedule.save({ session:session })
          if (!updateSchedule) {
            throw new Error('failed update schedule')
          }
        }

        /*--------------------------------------------------*/
        // コメント削除

        // コメント取得
        const setComments = await Comments.find({ mid:mid }).session(session)
        for (let setComment of setComments) {

          // コメント削除サイズ
          if (setComment.type === cmn.COMMENT_CTYPE || setComment.type === cmn.I_DELETE_CTYPE) {
            // 削除サイズセット
            //comment.images.map(i => deleteSize += i.size) // 画像は含めない
            setComment.files.map(f => deleteSize += f.size)

            // 前回画像
            const beforImages = []
            setComment.images.map(i => beforImages.push(i))
            beforCommentImagesAry.push(beforImages)
            // 前回ファイル
            const beforFiles = []
            setComment.files.map(f => beforFiles.push(f))
            beforCommentFilesAry.push(beforFiles)
          }
          
          // コメント削除
          await dbUti.deleteComment(setComment, session)
        }

        /*--------------------------------------------------*/
        // 自分の参照メッセージ、再投稿も削除

        let deleteRefMessage = null
        // 参照メッセージ取得
        const setRefMessage = await Messages.findOne({ wgid:_group.gid, wmoid:_group.moid, rmid:mid, type:cmn.REF_MTYPE }).session(session)
        if (setRefMessage) {
          // 参照メッセージ削除
          deleteRefMessage = await dbUti.deleteMessage(setRefMessage, session)
        }

        let deleteRepostMessage = null
        // 再投稿取得
        const setRepostMessage = await Messages.findOne({ wgid:_group.gid, wmoid:_group.moid, rmid:mid, type:cmn.REPOST_MTYPE }).session(session)
        if (setRepostMessage) {
          // 再投稿削除
          deleteRepostMessage = await dbUti.deleteMessage(setRepostMessage, session)
        }

        /*--------------------------------------------------*/
        
        // メッセージ削除
        const deleteMessage = await dbUti.deleteMessage(setMessage, session)

        // グループファイルサイズセット
        await gpUti.setGroupFilesize(gid, session, deleteSize, 0, ntime)
        
        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        // メッセージ画像削除
        await msUti.deleteImages(cmn.AWS_S3_IMAGES_BUCKET, mkey, beforMessageImages, [])
        // メッセージファイル削除
        await msUti.deleteFiles(cmn.AWS_S3_FILES_BUCKET, mkey, beforMessageFiles, [])
        // コメント画像削除
        for (let beforCommentImages of beforCommentImagesAry) {
          await msUti.deleteImages(cmn.AWS_S3_IMAGES_BUCKET, mkey, beforCommentImages, [])
        }
        // コメントファイル削除
        for (let beforCommentFiles of beforCommentFilesAry) {
          await msUti.deleteFiles(cmn.AWS_S3_FILES_BUCKET, mkey, beforCommentFiles, [])
        }

        json.message = null

        // メッセージポーリングデータセット
        cache.setMessagePollingData(deleteMessage, cmn.DELETE_PTYPE)
        // チャットメッセージデータ送信
        chat.sendMessageData(deleteMessage, cmn.DELETE_PTYPE)

        if (updateSchedule) { // スケジュールが更新されたら
          // resスケジュールセット
          await scUti.setResSchedule(req, [updateSchedule], gid)
          json.schedule = updateSchedule
          
          // スケジュールポーリングデータセット
          cache.setSchedulePollingData(updateSchedule, cmn.UPDATE_PTYPE)
        }

        // 参照メッセージ
        if (deleteRefMessage) {
          // 削除するのでメッセージ情報セットいらない
          json.refmessage = deleteRefMessage
          // 自分のホームから削除されるだけなのでポーリングデータ、チャットデータの送信はいらない
        }
        // 再投稿
        if (deleteRepostMessage) {
          // 削除するのでメッセージ情報セットいらない
          json.repostmessage = deleteRepostMessage

          // メッセージポーリングデータセット
          cache.setMessagePollingData(deleteRepostMessage, cmn.DELETE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(deleteRepostMessage, cmn.DELETE_PTYPE)
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

// ホームから削除
router.post('/remove', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''
        const dmoid = ckUti.checkId(req.body.dmoid) ? req.body.dmoid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !mid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        const isDirectMesage = (dmoid) ? true : false

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        
        if (!isDirectMesage) {
          // midチェック
          const checkMessage = await apUti.checkMid(json, mid)
          // 参照メッセージチェック
          if (checkMessage.wgid !== _group.gid || checkMessage.wmoid !== _group.moid || checkMessage.type !== cmn.REF_MTYPE) {
            json.code = 400
            throw new Error('invalid mid')
          }
        } else {
          // midチェック
          const checkMessage = await apUti.checkMid(json, mid)
          // ダイレクトメッセージ表示チェック
          apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
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

        if (!isDirectMesage) {
          // ダイレクトメッセージ以外

          // 参照メッセージ取得
          const setMessage = await Messages.findById(mid).session(session)
          // メッセージ削除
          await dbUti.deleteMessage(setMessage, session)
        } else {
          // ダイレクトメッセージ

          // メッセージ取得
          const setMessage = await Messages.findById(mid).session(session)
          if (setMessage) {
            // membersの自分を削除
            const index = setMessage.members.findIndex(oid => oid === _group.moid)
            if (index > -1) {
              setMessage.members.splice(index, 1)
              //setMessage.htime = ntime // ホーム時間は上げない
              setMessage.utime = ntime
              // メッセージ更新
              const updateMessage = await setMessage.save({ session:session })
              if (!updateMessage) {
                throw new Error('failed update message')
              }
            }
          }
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.result = 1

        // 自分のホームから削除されるだけなのでポーリングデータ、チャットデータの送信はいらない
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

// ファイル編集
router.post('/edit_file', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''
        const fname = ckUti.checkStr(req.body.fname) ? req.body.fname : ''
        const name = ckUti.checkStr(req.body.name) ? req.body.name : ''
        const desc = ckUti.checkStr(req.body.desc) ? req.body.desc : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !mid || !fname || !name) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)

        // midチェック(ファイルあり)
        const checkMessage = await apUti.checkMid(json, mid, true, 'files')
        // メッセージ表示チェック
        await apUti.checkMessageView(req, json, checkMessage, _group)
        // メッセージ作成者チェック
        apUti.checkMessageAuthor(json, checkMessage, _group)
        
        // ファイル存在チェック
        const file = checkMessage.files.find(f => f.fname === fname)
        if (!file) {
          json.code = 400
          throw new Error("can't found file")
        }

        // 名前チェック
        apUti.checkStrLength(json, name, 50, 'name')

        // 説明チェック
        if (desc) {
          apUti.checkStrLength(json, desc, 200, 'desc')
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

        // メッセージ取得
        const setMessage = await Messages.findById(mid).session(session)

        // テキスト変更

        // 絵文字対応するため文字配列にする
        const nameAry = [...name]
        const textAry = [...setMessage.text] 
        
        let bflg = false
        let d = 0 // 名前文字数の差分
        for (let block of setMessage.blocks) {
          
          if (bflg) block.offset += d

          let eflg = false
          for (let entity of block.entities) {
            
            if (eflg) entity.offset += d
            
            if (entity.type === cmn.FILE_OTYPE && entity.data.get('fname') === fname) {

              bflg = true
              eflg = true
              d = nameAry.length - entity.len

              // テキスト変更
              textAry.splice(block.offset + entity.offset, entity.len, ...nameAry)
              
              // ブロック変更
              block.len += d

              // エンティティ変更
              entity.len = nameAry.length
              entity.data.set('name', name)
            }
          }
        }

        setMessage.text = textAry.slice(0).join('')

        // 変更前ファイル文字列
        let beforFileText = ''
        // 変更後ファイル文字列
        let afterFileText = ''

        // ファイル変更
        const index = setMessage.files.findIndex(f => f.fname === fname)
        if (index > -1) {
          beforFileText = `${setMessage.files[index].data.get('name')}${(setMessage.files[index].data.get('desc')) ? `(${setMessage.files[index].data.get('desc')})` : ''}`

          setMessage.files[index].data = { name:name, desc:desc }

          afterFileText = `${setMessage.files[index].data.get('name')}${(setMessage.files[index].data.get('desc')) ? `(${setMessage.files[index].data.get('desc')})` : ''}`
        }

        let newComment = null

        if (beforFileText !== afterFileText) {

          //　ファイル変更コメント追加

          // 絵文字対応するため文字配列にする
          const beforFileTextAry = [...beforFileText]
          const afterFileTextAry = [...afterFileText]

          // ObjectId手動生成
          const _cid = new mongoose.Types.ObjectId
          const cid = String(_cid)

          // コメント作成
          const comment = await Comments.create(
            [{
              _id: _cid,
              gid: gid,
              mid: mid,
              cid: cid,
              wgid: _group.gid,
              wmoid: _group.moid,
              type: cmn.F_EDIT_CTYPE,
              text: `${beforFileText} ⇒ ${afterFileText}`,
              blocks: [{ offset:0, len:beforFileTextAry.length + ` ⇒ `.length + afterFileTextAry.length, entities:[] }],
              ctime: ntime,
              utime: ntime,
            }],
            { session:session }
          )
          if (!comment) {
            throw new Error('failed create comment')
          }
          newComment = comment[0]

          // 全てのコメント数
          setMessage.allccount += 1
        }

        setMessage.etime = ntime
        setMessage.htime = ntime
        setMessage.utime = ntime

        // メッセージ更新
        const updateMessage = await setMessage.save({ session:session })
        if (!updateMessage) {
          throw new Error('failed update message')
        }

        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // resメッセージセット
        await msUti.setResMessage(req, [updateMessage], gid, _group)
        json.message = updateMessage

        // メッセージポーリングデータセット
        cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
        // チャットメッセージデータ送信
        chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)

        if (newComment) { // コメントが作成されたら
          // resコメントセット
          await cmUti.setResComment(req, [newComment], gid)
          json.comment = newComment
          // チャットコメントデータ送信
          chat.sendCommentData(newComment, cmn.NEW_PTYPE)
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

// 再投稿
router.post('/repost', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const sgid = ckUti.checkId(req.body.sgid) ? req.body.sgid : '' // 選択gid
        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const mid =  ckUti.checkId(req.body.mid) ? req.body.mid : ''
        
        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !mid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)
        // メッセージ表示チェック
        await apUti.checkMessageView(req, json, checkMessage, _group)
        
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

        /*--------------------------------------------------*/

        // メッセージ取得
        const setMessage = await Messages.findById(mid).session(session)

        let newRepostMessage = null
        let updateRepostMessage = null
        let updateMessage = null

        // 再投稿メッセージ取得
        const setRepostMessage = await Messages.findOne({ wgid:_group.gid, wmoid:_group.moid, rmid:mid, type:cmn.REPOST_MTYPE }).session(session)
        if (!setRepostMessage) {

          // ObjectId手動生成
          const _repostMid = new mongoose.Types.ObjectId
          const repostMid = String(_repostMid)

          // 再投稿メッセージ作成
          const newRepostMessages = await Messages.create(
            [{
              _id: _repostMid,
              gid: _group.gid,
              mid: repostMid,
              type: cmn.REPOST_MTYPE,
              status: cmn.NOMAL_MSTATSU,
              pub: false,
              wgid: _group.gid,
              wmoid: _group.moid,
              rgid: setMessage.gid,
              rmid: setMessage.mid,
              rwgid: setMessage.wgid,
              rwmoid: setMessage.wmoid,
              pmode: cmn.NONE_PMODE,
              ctime: ntime,
              etime: ntime,
              htime: ntime,
              utime: ntime,
            }],
            { session:session })
          if (!newRepostMessages) {
            throw new Error('failed create message')
          }
          newRepostMessage = newRepostMessages[0]
          
          // メッセージのカウント増やす
          setMessage.rpcount += 1
          //setMessage.htime = ntime // ホーム時間は上げない
          setMessage.utime = ntime
          // メッセージ更新
          updateMessage = await setMessage.save({ session:session })
          if (!updateMessage) {
            throw new Error('failed update message')
          }
        } else {
          setRepostMessage.type = cmn.REPOST_MTYPE
          setRepostMessage.ctime = ntime
          setRepostMessage.etime = ntime
          setRepostMessage.htime = ntime
          setRepostMessage.utime = ntime
          // メッセージ更新
          updateRepostMessage = await setRepostMessage.save({ session:session })
          if (!updateRepostMessage) {
            throw new Error('failed update message')
          }
        }

        // 参照メッセージセット(再投稿アクティビティ)
        await msUti.setRefMessage(_group, cmn.ACTIVITY_REPOST_MSTATUS, setMessage, session)

        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        if (newRepostMessage) {
          // メッセージポーリングデータセット
          cache.setMessagePollingData(newRepostMessage, cmn.NEW_PTYPE)
        }
        if (updateRepostMessage) {
          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateRepostMessage, cmn.UPDATE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(updateRepostMessage, cmn.UPDATE_PTYPE)
        }
        if (updateMessage) {
          // resメッセージセット
          await msUti.setResMessage(req, [updateMessage], sgid, _group)
          json.message = updateMessage

          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)
        } else {
          json.message = null
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

// 再投稿削除
router.post('/delete_repost', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : '' // 選択gid
        const mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !mid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        
        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)
        // 参照メッセージチェック
        if (checkMessage.wgid !== _group.gid || checkMessage.wmoid !== _group.moid || checkMessage.type !== cmn.REPOST_MTYPE) {
          json.code = 400
          throw new Error('invalid mid')
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

        // 再投稿メッセージ取得
        const setRepostMessage = await Messages.findById(mid).session(session)
        const rmid = setRepostMessage.rmid
        // メッセージ削除
        const deleteRepostMessage = await dbUti.deleteMessage(setRepostMessage, session)

        let updateRefMessage = null
        // 参照先メッセージ取得
        const setRefMessage = await Messages.findById(rmid).session(session)
        if (setRefMessage) {
          // 参照先メッセージのカウント減らす
          setRefMessage.rpcount -= 1
          //setMessage.htime = ntime // ホーム時間は上げない
          setRefMessage.utime = ntime
          // 参照先メッセージ更新
          updateRefMessage = await setRefMessage.save({ session:session })
          if (!updateRefMessage) {
            throw new Error('failed update message')
          }
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // メッセージポーリングデータセット
        cache.setMessagePollingData(deleteRepostMessage, cmn.DELETE_PTYPE)
        // チャットメッセージデータ送信
        chat.sendMessageData(deleteRepostMessage, cmn.DELETE_PTYPE)
        
        if (updateRefMessage) {
          // resメッセージセット
          await msUti.setResMessage(req, [updateRefMessage], gid, _group)
          json.message = updateRefMessage

          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateRefMessage, cmn.UPDATE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(updateRefMessage, cmn.UPDATE_PTYPE)
        } else {
          json.message = null
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

// OK
router.post('/ok', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const sgid = ckUti.checkId(req.body.sgid) ? req.body.sgid : '' // 選択gid
        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const mid =  ckUti.checkId(req.body.mid) ? req.body.mid : ''
        
        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !mid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)
        // メッセージ表示チェック
        await apUti.checkMessageView(req, json, checkMessage, _group)
        // メッセージのgidセット
        const gid = checkMessage.gid
        
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

        /*--------------------------------------------------*/

        // メッセージ取得
        const setMessage = await Messages.findById(mid).session(session)
        // コメント取得
        const setComment = await Comments.findOne({ mid:mid, wgid:_group.gid, wmoid:_group.moid, type:cmn.OK_CTYPE }).session(session)

        // OKチェック
        const isOk = (!setComment) ? true : false

        let comment = null

        if (!setComment) {
          // OKコメント追加

          // ObjectId手動生成
          const _cid = new mongoose.Types.ObjectId
          const cid = String(_cid)

          // コメント作成
          const newComment = await Comments.create(
            [{
              _id: _cid,
              gid: gid,
              mid: mid,
              cid: cid,
              wgid: _group.gid,
              wmoid: _group.moid,
              type: cmn.OK_CTYPE,
              text: 'OK',
              blocks: [{ offset:0, len:'OK'.length, entities:[] }],
              ctime: ntime,
              utime: ntime,
            }],
            { session:session }
          )
          if (!newComment) {
            throw new Error('failed create comment')
          }
          comment = newComment[0]

          // OKメンバー追加
          if (setMessage.okmembers.length < cmn.MAX_OK_VIEW_COUNT) {
            const index = setMessage.okmembers.findIndex(oid => oid === _group.moid)
            if (index === -1) {
              setMessage.okmembers.push(_group.moid)
            }
          }

          // メッセージのカウント増やす
          setMessage.okcount += 1
          setMessage.allccount += 1

          // 参照メッセージセット(OKアクティビティ)
          await msUti.setRefMessage(_group, cmn.ACTIVITY_OK_MSTATUS, setMessage, session)
        } else {
          // OKコメント削除

          // コメント削除
          const deleteComment = await dbUti.deleteComment(setComment, session)
          comment = deleteComment

          // OKメンバー削除
          const index = setMessage.okmembers.findIndex(oid => oid === _group.moid)
          if (index > -1) {
            setMessage.okmembers.splice(index, 1)
          }

          // メッセージのカウント減らす
          setMessage.okcount -= 1
          setMessage.allccount -= 1
        }

        //setMessage.htime = ntime // ホーム時間は上げない
        setMessage.utime = ntime

        // メッセージ更新
        const updateMessage = await setMessage.save({ session:session })
        if (!updateMessage) {
          throw new Error('failed update message')
        }

        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        // resメッセージセット
        await msUti.setResMessage(req, [updateMessage], sgid, _group)
        json.message = updateMessage

        // メッセージポーリングデータセット
        cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
        // チャットメッセージデータ送信
        chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)

        // resコメントセット
        await cmUti.setResComment(req, [comment], sgid)
        json.comment = comment
        if (isOk) {
          // チャットコメントデータ送信
          chat.sendCommentData(comment, cmn.NEW_PTYPE)
        } else {
          // チャットコメントデータ送信
          chat.sendCommentData(comment, cmn.DELETE_PTYPE)
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

// DM拒否
router.post('/dm_block', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const sgid = ckUti.checkId(req.body.sgid) ? req.body.sgid : '' // 選択gid
        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''
        const dmoid = ckUti.checkId(req.body.dmoid) ? req.body.dmoid : ''
        const block = ckUti.checkBoolean(req.body.block) ? req.body.block : null
        
        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !mid || !dmoid || block === null) {
          json.code = 400
          throw new Error('invalid post')
        }

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)
        // ダイレクトメッセージ表示チェック
        apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)

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

        /*--------------------------------------------------*/

        // メッセージ取得
        const setMessage = await Messages.findById(mid).session(session)

        let status = setMessage.status

        if (block) {
          // 拒否
          if (status !== cmn.DM_11_MSTATUS) {
            if (status === cmn.NOMAL_MSTATSU) {
              if (setMessage.objects[0] === _group.moid) status = cmn.DM_10_MSTATUS
              if (setMessage.objects[1] === _group.moid) status = cmn.DM_01_MSTATUS
            } else if (status === cmn.DM_10_MSTATUS) {
              if (setMessage.objects[1] === _group.moid) status = cmn.DM_11_MSTATUS
            } else if (status === cmn.DM_01_MSTATUS) {
              if (setMessage.objects[0] === _group.moid) status = cmn.DM_11_MSTATUS
            }
          }
        } else {
          // 拒否解除
          if (status !== cmn.NOMAL_MSTATSU) {
            if (status === cmn.DM_10_MSTATUS) {
              if (setMessage.objects[0] === _group.moid) status = cmn.NOMAL_MSTATSU
            } else if (status === cmn.DM_01_MSTATUS) {
              if (setMessage.objects[1] === _group.moid) status = cmn.NOMAL_MSTATSU
            } else if (status === cmn.DM_11_MSTATUS) {
              if (setMessage.objects[0] === _group.moid) status = cmn.DM_01_MSTATUS
              if (setMessage.objects[1] === _group.moid) status = cmn.DM_10_MSTATUS
            }
          }
        }
        
        setMessage.status = status

        //setMessage.htime = ntime // ホーム時間は上げない
        setMessage.utime = ntime

        // メッセージ更新
        const updateMessage = await setMessage.save({ session:session })
        if (!updateMessage) {
          throw new Error('failed update message')
        }

        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        // resメッセージセット
        await msUti.setResMessage(req, [updateMessage], sgid, _group)
        json.message = updateMessage

        // チャットメッセージデータ送信
        chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)
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

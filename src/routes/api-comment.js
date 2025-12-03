const cmn = require('../common')
const cache = require('../cache') 
const chat = require('../chat')
const ckUti = require('../check-util')
const apUti = require('../api-util')
const gpUti = require('../group-util')
const msUti = require('../message-util')
const cmUti = require('../comment-util')
const dbUti = require('../db-util')
const dtUti = require('../datetime-util')

const express = require('express')
const router = express.Router()

// MongoDB
const mongoose = require('mongoose')
const db = mongoose.connection

// スキーマ
const Objects = require('../schema/objects')
const Messages = require('../schema/messages')
const Comments = require('../schema/comments')

/*--------------------------------------------------*/
//#region GET

// 一覧取得
router.get('/list', (req, res, next) => {
    
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const mid = ckUti.checkId(req.query.mid) ? req.query.mid : ''
      const viewType = ckUti.checkStrNumber(req.query.v) ? req.query.v : ''
      const page = ckUti.checkStrNumber(req.query.p) ? req.query.p : ''

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
      const dmoid = ckUti.checkId(req.query.dmoid) ? req.query.dmoid : ''
      const offsetPlus = ckUti.checkStrNumber(req.query.op) ? req.query.op : '0'
      const offsetMinus = ckUti.checkStrNumber(req.query.om) ? req.query.om : '0'

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sgid || !mid || !viewType || !page) {
        json.code = 400
        throw new Error('invalid get')
      }

      const isDirectMesage = (dmoid) ? true : false
      
      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

      // midチェック
      const checkMessage = await apUti.checkMid(json, mid)

      if (!isDirectMesage) {
        // メッセージ表示チェック
        await apUti.checkMessageView(req, json, checkMessage, _group)
      } else {
        // ダイレクトメッセージ表示チェック
        apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
      }

      // 表示タイプチェック
      if (
        (viewType !== String(cmn.COMMENT_CVTYPE)) &&
        (viewType !== String(cmn.OK_CVTYPE)) &&
        (viewType !== String(cmn.HISTORY_CVTYPE))
      ) {
        json.code = 400
        throw new Error('invalid view type')
      }

      /*--------------------------------------------------*/

      // 表示タイプ
      let findType = cmn.COMMENT_CTYPE
      if (viewType === String(cmn.OK_CVTYPE)) {
        findType = cmn.OK_CTYPE
      } else if (viewType === String(cmn.HISTORY_CVTYPE)) {
        findType = { $gte:cmn.EDIT_CTYPE }  
      }

      // 検索条件
      const find = { mid:mid, type:findType }
      // 指定列
      const project = { _id:0 }
      // 並び順
      const sort = { cid:-1 }
      // ページ
      const numberPage = parseInt(page)
      // オフセット
      const numberOffsetPlus = parseInt(offsetPlus)
      const numberOffsetMinus = parseInt(offsetMinus)
      // スキップ
      let skip = (numberPage * cmn.COMMENT_READ_LIMIT) + numberOffsetPlus - numberOffsetMinus
      if (skip < 0) skip = 0

      // コメント取得
      const aggregateAry = [
        { $match: find }, 
        { $project: project },
        { $sort: sort },
        { $limit: cmn.COMMENT_READ_LIMIT + skip },
        { $skip: skip },
      ]
      const comments = await Comments.aggregate(aggregateAry)
      if (comments) {
        // resコメントセット
        await cmUti.setResComment(req, comments, sgid)
        json.comments = comments
      } else {
        throw new Error('failed find comments')
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

// ルームチェック
router.get('/checkroom', (req, res, next) => {
  
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
      const mid = ckUti.checkId(req.query.mid) ? req.query.mid : ''
      const key = ckUti.checkKey(req.query.key) ? req.query.key : ''
      const dmoid = ckUti.checkId(req.query.dmoid) ? req.query.dmoid : ''
      
      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sgid || !moid || !mid || !key) {
        json.code = 400
        throw new Error('invalid get')
      }

      const isDirectMesage = (dmoid) ? true : false

      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

      // midチェック
      const checkMessage = await apUti.checkMid(json, mid)
      
      if (!isDirectMesage) {
        // メッセージ表示チェック
        await apUti.checkMessageView(req, json, checkMessage, _group)
      } else {
        // ダイレクトメッセージ表示チェック
        apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
      }

      /*--------------------------------------------------*/

      // ルームチャットが可能かチェック
      const isChat = await chat.checkRoomChat(mid, key)
      json.chat = isChat
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

// 個別コメント取得
router.get('/:cid', (req, res, next) => {
  
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const cid = ckUti.checkId(req.params.cid) ? req.params.cid : ''
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const mid = ckUti.checkId(req.query.mid) ? req.query.mid : ''

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
      const dmoid = ckUti.checkId(req.query.dmoid) ? req.query.dmoid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!cid || !sgid || !mid) {
        json.code = 400
        throw new Error('invalid get')
      }

      const isDirectMesage = (dmoid) ? true : false

      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

      // midチェック
      const checkMessage = await apUti.checkMid(json, mid)

      if (!isDirectMesage) {
        // メッセージ表示チェック
        await apUti.checkMessageView(req, json, checkMessage, _group)
      } else {
        // ダイレクトメッセージ表示チェック
        apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
      }

      /*--------------------------------------------------*/

      // コメント取得
      const aggregateAry = [
        { $match: { cid:cid } },
        { $project: { _id:0 } },
      ]
      const comments = await Comments.aggregate(aggregateAry)
      if (comments) {
        if (comments.length === 1 && comments[0].mid === mid) {
          const comment = comments[0]

          // resコメントセット
          await cmUti.setResComment(req, [comment], sgid)
          json.comment = comment
        } else {
          json.comment = null
        }
      } else {
        throw new Error('failed find comment')
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

// 新規
router.post('/', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const sgid = ckUti.checkId(req.body.sgid) ? req.body.sgid : '' // 選択gid
        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        let mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''
        const dmoid = ckUti.checkId(req.body.dmoid) ? req.body.dmoid : '' // ダイレクトメッセージmoid
        const content = (req.body.content) ? req.body.content : null
        const images = (req.body.images) ? (Array.isArray(req.body.images) ? req.body.images : []) : []

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (
          !sgid || 
          (!moid || !content) ||
          (!dmoid && !mid)
        ) {
          json.code = 400
          throw new Error('invalid post')
        }

        const isDirectMesage = (dmoid) ? true : false

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        let gid = ''
        let mkey = ''

        if (!isDirectMesage) {
          // midチェック
          const checkMessage = await apUti.checkMid(json, mid)
          // メッセージ表示チェック
          await apUti.checkMessageView(req, json, checkMessage, _group)
          // メッセージのgidセット
          gid = checkMessage.gid
          // メッセージのmkeyセット
          mkey = checkMessage.mkey
        } else {
          // ダイレクトメッセージ

          // dmoidチェック
          const checkMember = await apUti.checkMoid(json, dmoid)
          // ダイレクトメッセージポリシーチェック
          const isDm = await apUti.checkDirectMessagePolicy(json, checkMember, _group)
          if (!isDm) {
            json.code = 400
            throw new Error('invalid direct message policy')
          }
          
          if (mid) {
            // midチェック
            const checkMessage = await apUti.checkMid(json, mid)
            // ダイレクトメッセージ表示チェック
            apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
            // メッセージのmkeyセット
            mkey = checkMessage.mkey
          } else {
            // ダイレクトメッセージ新規mkey作成
            mkey = cmn.generateReverseObjectId()
          }
        }
        
        // 文字数取得
        const count = msUti.getStrCount(content)

        // 文字数チェック
        if (count === 0 && images.length === 0) {
          json.code = 400
          throw new Error('not content')
        }
        if (count > cmn.EDITOR_STR_LIMIT) {
          json.code = 400
          throw new Error('str limit over')
        }

        const files = []

        // エンティティチェック
        for (let i = 0; i < content.blocks.length; i++) {
          const block = content.blocks[i]
          
          for (let entity of block.entityRanges) {

            const entityMap = content.entityMap[entity.key]

            // data.gidがgidと同じなら不要なので消す
            if (gid && 'gid' in entityMap.data) {
              if (entityMap.data.gid === gid) {
                delete entityMap.data.gid
              }
            }
            
            // タイプがファイルかメンバーの場合セット
            const checkType = Number(entityMap.type)
            const type = (checkType === cmn.FILE_OTYPE || checkType === cmn.MEMBER_OTYPE) ? checkType : 0

            if (type === 0) {
              json.code = 400
              throw new Error(`invalid entiry type ${entityMap.type}`)
            }

            if (type === cmn.FILE_OTYPE) {
              // ファイル
              files.push({
                fname: entityMap.data.fname,
                type: cmn.FILE_FTYPE,
                data: { name:entityMap.data.name, desc:'' }
              })
            }
          }
        }

        // 画像チェック
        msUti.checkImages(json, [], images)
        // ファイルチェック
        msUti.checkFiles(json, [], files)

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

        // 画像・ファイルサイズ初期化
        images.map(i => i.size = 0)
        files.map(f => f.size = 0)

        // ObjectId手動生成
        const _cid = new mongoose.Types.ObjectId
        const cid = String(_cid)

        /*--------------------------------------------------*/

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

        // 追加サイズセット
        let addSize = 0
        //images.map(i => addSize += i.size) // 画像は含めない
        files.map(f => addSize += f.size)

        /*--------------------------------------------------*/
        // ダイレクトメッセージ

        if (isDirectMesage && !mid) {

          // ObjectId手動生成
          const _mid = new mongoose.Types.ObjectId
          mid = String(_mid)

          // ダイレクトメッセージ作成
          const message = await Messages.create(
            [{
              _id: _mid,
              gid: '',
              mid: mid,
              mkey: mkey,
              type: cmn.DM_MTYPE,
              status: cmn.NOMAL_MSTATSU,
              pub: false,
              wgid: '',
              wmoid: '',
              pmode: cmn.MEMBER_PMODE,
              members: [_group.moid, dmoid],
              objects: [_group.moid, dmoid],
              ctime: ntime,
              etime: ntime,
              htime: ntime,
              utime: ntime,
            }],
            { session:session })
          if (!message) {
            throw new Error('failed create direct message')
          }
        }

        /*--------------------------------------------------*/
        // コメント

        // コメント作成
        const comment = await Comments.create(
          [{
            _id: _cid,
            gid: gid,
            mid: mid,
            cid: cid,
            wgid: _group.gid,
            wmoid: _group.moid,
            type: cmn.COMMENT_CTYPE,
            text: textBlocksMap.text,
            blocks: textBlocksMap.blocks,
            images: images,
            files: files,
            ctime: ntime,
            utime: ntime,
          }],
          { session:session }
        )
        if (!comment) {
          throw new Error('failed create comment')
        }
        const newComment = comment[0]

        /*--------------------------------------------------*/
        // メッセージ

        // メッセージ取得
        const setMessage = await Messages.findById(mid).session(session)

        if (isDirectMesage) {
          // ダイレクトメッセージ

          // 最終コメント者
          setMessage.wgid = _group.gid
          setMessage.wmoid = _group.moid
          
          // 削除チェック
          const index = setMessage.members.findIndex(oid => oid === _group.moid)
          if (index === -1) {
            // メンバー追加
            setMessage.members.push(_group.moid)
          }

          if (textBlocksMap.text) {
            // コメントをメッセージに短縮して表示
            const textAry = [...textBlocksMap.text]
            if (textAry.length > 50) {
              textAry.splice(50)
              textAry.push('.')
              textAry.push('.')
              textAry.push('.')
            }
            setMessage.text = textAry.join('')
            setMessage.blocks = [{ offset:0, len:textAry.length, entities:[] }]
          }

          setMessage.htime = ntime // ダイレクトメッセージはホーム時間を上げる
        }

        setMessage.ccount += 1
        setMessage.allccount += 1
        setMessage.utime = ntime

        // メッセージ更新
        const updateMessage = await setMessage.save({ session:session })
        if (!updateMessage) {
          throw new Error('failed update message')
        }

        if (!isDirectMesage) { // ダイレクトメッセージ以外
          // グループファイルサイズセット
          await gpUti.setGroupFilesize(gid, session, 0, addSize, ntime)
        }

        if (!isDirectMesage) { // ダイレクトメッセージ以外
          // 参照メッセージセット(コメントアクティビティ)
          await msUti.setRefMessage(_group, cmn.ACTIVITY_COMMENT_MSTATUS, setMessage, session)

          let isReply = false
          if (textBlocksMap.objects.length > 0) {
            // ユーザー指定がある場合
            const oidSet = new Set()
            textBlocksMap.objects.map(oid => {
              if (_group.moid !== oid) oidSet.add(oid)
            })
            if (oidSet.size > 0) {
              // 一意の配列に変換
              const oidArray = Array.from(oidSet)
              const checkObjects = await Objects.find({ oid:{ $in:oidArray } }).select('gid oid type').session(session)
              for (let checkObject of checkObjects) {
                if (checkObject.type === cmn.MEMBER_OTYPE) {
                  // 参照メッセージセット(返信パッシブ)
                  const group = { gid:checkObject.gid, moid:checkObject.oid }
                  await msUti.setRefMessage(group, cmn.PASSIVE_REPLY_MSTATUS, setMessage, session)
                  if (checkObject.oid === setMessage.wmoid)
                    isReply = true
                }
              }
            }
          }

          if (setMessage.wmoid !== _group.moid && !isReply) {
            // 参照メッセージセット(コメントパッシブ)
            const group = { gid:setMessage.wgid, moid:setMessage.wmoid }
            await msUti.setRefMessage(group, cmn.PASSIVE_COMMENT_MSTATUS, setMessage, session)
          }
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

        // resメッセージセット
        await msUti.setResMessage(req, [updateMessage], sgid, _group)
        json.message = updateMessage

        if (!isDirectMesage) { // ダイレクトメッセージでは無い
          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
        }
        // チャットメッセージデータ送信
        chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)

        // resコメントセット
        await cmUti.setResComment(req, [newComment], sgid)
        json.comment = newComment
        
        // チャットコメントデータ送信
        chat.sendCommentData(newComment, cmn.NEW_PTYPE)
        
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

        const sgid = ckUti.checkId(req.body.sgid) ? req.body.sgid : '' // 選択gid
        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const mid = ckUti.checkId(req.body.mid) ? req.body.mid : ''
        const cid = ckUti.checkId(req.body.cid) ? req.body.cid : ''
        const dmoid = ckUti.checkId(req.body.dmoid) ? req.body.dmoid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !mid || !cid) {
          json.code = 400
          throw new Error('invalid post')
        }

        const isDirectMesage = (dmoid) ? true : false

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)
        
        if (!isDirectMesage) {
          // メッセージ表示チェック
          await apUti.checkMessageView(req, json, checkMessage, _group)
        } else {
          // ダイレクトメッセージ表示チェック
          apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
        }
        
        // メッセージのgidセット
        const gid = checkMessage.gid
        const mkey = checkMessage.mkey

        // cidチェック
        const checkComment = await apUti.checkCid(json, cid)
        // 削除する権限をもっているかチェック
        let isDelete = false
        if (!isDirectMesage) {
          // 作成者チェック
          if (checkMessage.wgid === _group.gid && checkMessage.wmoid === _group.moid) {
            isDelete = true
          }
          // コメント作成者チェック
          if (!isDelete && checkComment.wgid === _group.gid && checkComment.wmoid === _group.moid) {
            isDelete = true
          }
          // グループ管理者チェック
          if (!isDelete && await ckUti.checkGroupAdmin(_group)) { 
            isDelete = true
          }
        } else {
          // 削除する権限をもっているかチェック
          if (checkComment.wgid === _group.gid && checkComment.wmoid === _group.moid) {
            // コメント作成者
            isDelete = true
          }
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

        /*--------------------------------------------------*/
        // コメント

        // コメント取得
        const setComment = await Comments.findById(cid).session(session)

        // 削除サイズセット
        let deleteSize = 0
        //comment.images.map(i => deleteSize += i.size) // 画像は含めない
        setComment.files.map(f => deleteSize += f.size)

        // 前回画像
        const beforImages = []
        setComment.images.map(i => beforImages.push(i))
        // 前回ファイル
        const beforFiles = []
        setComment.files.map(f => beforFiles.push(f))
        
        // コメント削除
        const deleteComment = await dbUti.deleteComment(setComment, session)
        
        /*--------------------------------------------------*/
        // メッセージ

        // メッセージ取得
        const setMessage = await Messages.findById(mid).session(session)

        if (isDirectMesage) {
          // ダイレクトメッセージ

          let textAry = [' ']
          // 最新コメント取得
          const checkComments = await Comments.find({ mid:mid, type:cmn.COMMENT_CTYPE, text:{ $ne:'' } }).select('wgid wmoid text ctime').sort({ ctime:-1 }).limit(1).session(session)
          if (checkComments.length === 1) {
            const checkComment = checkComments[0]
            // 最終コメント者
            setMessage.wgid = checkComment.wgid
            setMessage.wmoid = checkComment.wmoid
            // コメントをメッセージに短縮して表示
            textAry = [...checkComment.text]
            if (textAry.length > 50) {
              textAry.splice(50)
              textAry.push('.')
              textAry.push('.')
              textAry.push('.')
            }
            // ホーム時間を最終コメントに
            setMessage.htime = checkComment.ctime
          } else {
            setMessage.wgid = ''
            setMessage.wmoid = ''
            setMessage.htime = setMessage.ctime
          }
          setMessage.text = textAry.join('')
          setMessage.blocks = [{ offset:0, len:textAry.length, entities:[] }]
        }

        setMessage.ccount -= 1
        setMessage.allccount -= 1
        //setMessage.htime = ntime // ホーム時間は上げない
        setMessage.utime = ntime

        // メッセージ更新
        const updateMessage = await setMessage.save({ session:session })
        if (!updateMessage) {
          throw new Error('failed update message')
        }

        if (!isDirectMesage) {
          // グループファイルサイズセット
          await gpUti.setGroupFilesize(gid, session, deleteSize, 0, ntime)
        }

        /*--------------------------------------------------*/

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // 画像削除
        await msUti.deleteImages(cmn.AWS_S3_IMAGES_BUCKET, mkey, beforImages, [])
        // ファイル削除
        await msUti.deleteFiles(cmn.AWS_S3_FILES_BUCKET, mkey, beforFiles, [])

        // resメッセージセット
        await msUti.setResMessage(req, [updateMessage], sgid, _group)
        json.message = updateMessage

        if (!isDirectMesage) { // ダイレクトメッセージでは無い
          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
        }
        // チャットメッセージデータ送信
        chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)

        json.comment = null
        
        // チャットコメントデータ送信
        chat.sendCommentData(deleteComment, cmn.DELETE_PTYPE)
        
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

// ルームに入る
router.post('/inroom', (req, res, next) => {
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
        const key = ckUti.checkKey(req.body.key) ? req.body.key : ''
        const dmoid = ckUti.checkId(req.body.dmoid) ? req.body.dmoid : ''
        
        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !mid || !key) {
          json.code = 400
          throw new Error('invalid post')
        }

        const isDirectMesage = (dmoid) ? true : false

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)

        if (!isDirectMesage) {
          // メッセージ表示チェック
          await apUti.checkMessageView(req, json, checkMessage, _group)
        } else {
          // ダイレクトメッセージ表示チェック
          apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
        }

        /*--------------------------------------------------*/
        
        // ルームに入る
        chat.inRoom(mid, key)

        json.result = 1

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

// ルームを出る
router.post('/outroom', (req, res, next) => {
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
        const key = ckUti.checkKey(req.body.key) ? req.body.key : ''
        const dmoid = ckUti.checkId(req.body.dmoid) ? req.body.dmoid : ''
        
        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !mid || !key) {
          json.code = 400
          throw new Error('invalid post')
        }

        const isDirectMesage = (dmoid) ? true : false
        
        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // midチェック
        const checkMessage = await apUti.checkMid(json, mid)
        
        if (!isDirectMesage) {
          // メッセージ表示チェック
          await apUti.checkMessageView(req, json, checkMessage, _group)
        } else {
          // ダイレクトメッセージ表示チェック
          apUti.checkDirectMessageView(json, checkMessage, _group.moid, dmoid)
        }

        /*--------------------------------------------------*/
        
        // ルームを出る
        chat.outRoom(mid, key)

        json.result = 1

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

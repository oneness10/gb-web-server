const cmn = require('../common')
const cache = require('../cache') 
const chat = require('../chat')
const ckUti = require('../check-util')
const dUti = require('../datetime-util')
const apUti = require('../api-util')
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

// 取り込みスケジュールセット
const _setInSchedule = (schedules, sgid, oidArray) => {
  
  for (let schedule of schedules) {

    let _schedule = schedule
    if ('_doc' in schedule) _schedule = schedule._doc

    _schedule.rst = cmn.NONE_RSTATUS // 参照状態

    if (_schedule.type === cmn.INSCHEDULE_STYPE) {
      // _schedule.gid = _schedule.rgid // セットしない
      // _schedule.sid = _schedule.rsid // セットしない
      // _schedule.oid = _schedule.roid // セットしない
      
      if ('insch' in _schedule && _schedule.insch.length === 1) {
        const insch = _schedule.insch[0]

        //_schedule.type = insch.type // タイプはセットしない
        //_schedule.ymd = insch.ymd // ymdはセットしない
        _schedule.pmode = insch.pmode

        if (
          (insch.gid === sgid && oidArray.find(oid => insch.members.includes(oid))) || // 選択グループでmembersに含まれ表示できる
          (insch.gid !== sgid && insch.pmode === cmn.ALL_PMODE) // グループ外で全て公開モード
        ) {
          _schedule.rst = cmn.NORMAL_RSTATUS // 参照状態通常

          _schedule.pub = insch.pub
          _schedule.wgid = insch.wgid
          _schedule.wmoid = insch.wmoid
          _schedule.mid = insch.mid
          _schedule.title = insch.title
          _schedule.tflg = insch.tflg
          _schedule.color = cmn.SCH_IN_COLOR //insch.color
          _schedule.incount = insch.incount
          _schedule.details = insch.details
          _schedule.stime = insch.stime
          _schedule.etime = insch.etime
          _schedule.ctime = insch.ctime
          _schedule.utime = insch.utime
        } else {
          _schedule.rst = cmn.NOTVIEW_RSTATUS // 参照状態表示できない
          // スケジュール情報クリア
          scUti.clearScheduleInfo(_schedule)
        }
      } else {
        _schedule.rst = cmn.DELETE_RSTATUS // 参照状態削除
        // スケジュール情報クリア
        scUti.clearScheduleInfo(_schedule)
      }
    }
  }
}

// 取り込みスケジュール結合取得
const _getInScheduleLookup = () => {
  return {
    $lookup: {
      from: 'schedules',
      let: {
        local_rgid:'$rgid',
        local_rsid:'$rsid',
      },
      pipeline: [
        { $match: {
            $expr: {
              $and: [
                { $ne: ['$$local_rsid', ''] },
                { $eq: ['$$local_rgid', '$gid'] },
                { $eq: ['$$local_rsid', '$sid'] },
              ]
            },
          }
        },
        { $project: { _id:0 } },
      ],
      as: 'insch',
    }
  }
}

/*--------------------------------------------------*/

// 一覧取得
router.get('/list', function(req, res, next) {
  
  const doAsync = async (req, res) => {

    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const soid = ckUti.checkId(req.query.soid) ? req.query.soid : '' // 選択oid
      
      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''
      const bd = ckUti.checkStr(req.query.bd) ? req.query.bd : ''
      const td = ckUti.checkStr(req.query.td) ? req.query.td : ''
      const nd = ckUti.checkStr(req.query.nd) ? req.query.nd : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sgid || !soid) {
        json.code = 400
        throw new Error('invalid get')
      }

      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)
      // oidチェック
      await apUti.checkOid(json, sgid, soid, false)

      // Ymd文字チェック
      const ymd = []
      if (bd) {
        apUti.checkYmdStr(json, bd)
        ymd.push({ ymd:Number(bd) })
      }
      if (td) {
        apUti.checkYmdStr(json, td)
        ymd.push({ ymd:Number(td) })
      }
      if (nd) {
        apUti.checkYmdStr(json, nd)
        ymd.push({ ymd:Number(nd) })
      }
      
      /*--------------------------------------------------*/

      // グループの関連oid配列取得
      const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)

      // スケジュール取得
      const aggregateAry = [
        { $match: {
          gid: sgid,
          oid: soid,
          $and: [{ $or:ymd }],
          $or:[
            { rgid: '', members:(groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray } },
            { rgid: { $ne:'' } },
          ],
        }},
        { $project: { _id:0, members:0, histories:0 } },
        { $sort: { stime:1 } },
        _getInScheduleLookup(), // 取り込みスケジュール結合取得
      ]
      const schedules = await Schedules.aggregate(aggregateAry)
      if (schedules) {
        // 取り込みスケジュールセット
        _setInSchedule(schedules, sgid, groupOidArray)
        // resスケジュールセット
        await scUti.setResSchedule(req, schedules, sgid)
        json.schedules = schedules
      } else {
        throw new Error('failed find schedules')
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

// 月取得
router.get('/month', function(req, res, next) {
  
  const doAsync = async (req, res) => {

    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const soid = ckUti.checkId(req.query.soid) ? req.query.soid : '' // 選択oid
      const ym = ckUti.checkStrNumber(req.query.ym) ? req.query.ym : ''

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sgid || !soid || !ym) {
        json.code = 400
        throw new Error('invalid get')
      }

      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)
      // oidチェック
      await apUti.checkOid(json, sgid, soid, false)
      
      // Ymd文字チェック
      const ymd = `${ym}01`
      const date = apUti.checkYmdStr(json, ymd)

      /*--------------------------------------------------*/

      // グループの関連oid配列取得
      const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)

      // 開始・終了ymd
      const eDate = new Date(date.getTime())
      eDate.setMonth(eDate.getMonth() + 1)
      eDate.setDate(eDate.getDate() - 1)
      const sYmd = dUti.getDateToYmd(date)
      const eYmd = dUti.getDateToYmd(eDate)
      
      const aggregateAry = [
        { $match: {
          gid: sgid,
          oid: soid,
          $and:[{ymd:{$gte:sYmd}}, {ymd:{$lte:eYmd}}],
          $or:[
            { rgid: '', members:(groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray } },
            { rgid: { $ne:'' } },
          ],
        }},
        { $project: { ymd:1, sid:1 } },
        { $sort: { ymd:1 } },
      ]
      // スケジュール取得
      const month = await Schedules.aggregate(aggregateAry)
      if (month) {
        json.month = month
      } else {
        throw new Error('failed find schedule month')
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

// カレンダー取得
router.get('/calendar', function(req, res, next) {
  
  const doAsync = async (req, res) => {

    const json = { code:200, errors:{} }
    try {
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const soid = ckUti.checkId(req.query.soid) ? req.query.soid : '' // 選択oid
      const ym = ckUti.checkStrNumber(req.query.ym) ? req.query.ym : ''

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sgid || !soid || !ym) {
        json.code = 400
        throw new Error('invalid get')
      }

      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)
      // oidチェック
      await apUti.checkOid(json, sgid, soid, false)
      
      // Ymd文字チェック
      const ymd = `${ym}01`
      const date = apUti.checkYmdStr(json, ymd)

      /*--------------------------------------------------*/

      // グループの関連oid配列取得
      const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)

      // 開始・終了ymd
      const eDate = new Date(date.getTime())
      eDate.setMonth(eDate.getMonth() + 1)
      eDate.setDate(eDate.getDate() - 1)
      const sYmd = dUti.getDateToYmd(date)
      const eYmd = dUti.getDateToYmd(eDate)

      // カレンダー取得
      const aggregateAry = [
        { $match: {
          gid: sgid,
          oid: soid,
          $and:[{ymd:{$gte:sYmd}}, {ymd:{$lte:eYmd}}],
          $or:[
            { rgid: '', members:(groupOidArray.length === 1) ? groupOidArray[0] : { $in:groupOidArray } },
            { rgid: { $ne:'' } },
          ],
        }},
        { $project: { _id:0, members:0, histories:0 } },
        { $sort: { stime:1 } },
        _getInScheduleLookup(), // 取り込みスケジュール結合取得
      ]
      const calendar = await Schedules.aggregate(aggregateAry)
      if (calendar) {
        // 取り込みスケジュールセット
        _setInSchedule(calendar, sgid, groupOidArray)
        // resスケジュールセット
        await scUti.setResSchedule(req, calendar, sgid)
        json.calendar = calendar
      } else {
        throw new Error('failed find calendar')
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

// 個別取得(取り込みスケジュールはエラー)
router.get('/:sid', (req, res, next) => {
  
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const sid = ckUti.checkId(req.params.sid) ? req.params.sid : ''
      const sgid = ckUti.checkId(req.query.sgid) ? req.query.sgid : '' // 選択gid
      const soid = ckUti.checkId(req.query.soid) ? req.query.soid : '' // 選択oid

      const moid = ckUti.checkId(req.query.moid) ? req.query.moid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!sid || !sgid || !soid) {
        json.code = 400
        throw new Error('invalid get')
      }

      // グループとメンバーチェック(グループは所属か公開)
      const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)
      // oidチェック
      await apUti.checkOid(json, sgid, soid, false)
      
      /*--------------------------------------------------*/

      // スケジュール取得
      const aggregateAry = [
        { $match:{ sid:sid } },
        { $project:{ _id:0, histories:0 } },
      ]
      const schedules = await Schedules.aggregate(aggregateAry)
      if (schedules) {
        if (schedules.length === 1) {
          const schedule = schedules[0]

          if (schedule.type === cmn.SCHEDULE_STYPE) { // スケジュール
            // スケジュール表示チェック
            await apUti.checkScheduleView(req, json, schedule, _group)
          } else if (schedule.type === cmn.INSCHEDULE_STYPE) {
            // 取り込みスケジュール
            const refSchedule = await Schedules.findById(schedule.rsid).select('-histories')
            schedule.insch = [refSchedule]
            // グループの関連oid配列取得
            const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)
            // 取り込みスケジュールセット
            _setInSchedule([schedule], sgid, groupOidArray)
          }

          // resスケジュールセット
          await scUti.setResSchedule(req, [schedule], sgid)
          json.schedule = schedule
        } else {
          json.schedule = null
        }
      } else {
        throw new Error('failed find schedule')
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
router.post('/', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const oid = ckUti.checkId(req.body.oid) ? req.body.oid : ''
        const sid = ckUti.checkId(req.body.sid) ? req.body.sid : ''
        const pmode = ckUti.checkNumber(req.body.pmode) ? req.body.pmode : 0
        const title = ckUti.checkStr(req.body.title) ? req.body.title : ''
        const tflg = ckUti.checkNumber(req.body.tflg) ? req.body.tflg : 0
        const color = ckUti.checkNumber(req.body.c) ? req.body.c : 0
        const stime = ckUti.checkNumber(req.body.stime) ? req.body.stime : 0
        const etime = ckUti.checkNumber(req.body.etime) ? req.body.etime : 0

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !oid || !pmode || !title || !tflg || !color || !stime || !etime) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, oid)

        // sidチェック
        if (sid === '') {
          // オブジェクトスケジュール作成チェック
          apUti.checkObjectScheduleCreate(json, _group, checkObject)
        } else {
          // sidチェック
          const checkSchedule = await apUti.checkSid(json, sid)
          // スケジュール表示チェック
          await apUti.checkScheduleView(req, json, checkSchedule, _group)
          // スケジュール編集チェック
          await apUti.checkScheduleEdit(json, _group, checkObject, checkSchedule)
        }

        // pmodeチェック
        if (
          (pmode !== cmn.ALL_PMODE && pmode !== cmn.MEMBER_PMODE && pmode !== cmn.SELF_PMODE) || 
          (_group.mode === cmn.HOMEPAGE_GMODE && pmode === cmn.MEMBER_PMODE) // ホームページモード&公開モードが関連メンバー
        ) {
          json.code = 400
          throw new Error('invalid pmode')
        }
        
        // titleチェック
        apUti.checkStrLength(json, title, 50, 'title')

        // 色チェック
        if (!(
          color === cmn.SCH1_COLOR || 
          color === cmn.SCH2_COLOR ||
          color === cmn.SCH3_COLOR ||
          color === cmn.SCH4_COLOR || 
          color === cmn.SCH5_COLOR
        )) {
          json.code = 400
          throw new Error('invalid color')
        }

        // 時間フラグチェック
        if (!(
          tflg === cmn.SET_TFLG || 
          tflg === cmn.START_TFLG ||
          tflg === cmn.END_TFLG ||
          tflg === cmn.ALL_TFLG || 
          tflg === cmn.AM_TFLG || 
          tflg === cmn.PM_TFLG
        )) {
          json.code = 400
          throw new Error('invalid tflg')
        }

        // UNIXタイムチェック
        apUti.checkUtime(json, stime)
        apUti.checkUtime(json, etime)

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
        
        // ymd
        const ymd = dUti.getUtimeToYmd(stime)

        // 関連メンバーを作成
        let members = [_group.moid]
        if (pmode === cmn.ALL_PMODE) {
          // goidのみ
          members = [_group.goid]
        }

        if (sid === '') {
          // 新規

          // ObjectId手動生成
          const _sid = new mongoose.Types.ObjectId
          const sid = String(_sid)

          // 公開
          const pub = (_group.mode !== cmn.GROUPWARE_GMODE) ? true : false

          // スケジュール作成
          const schedule = await Schedules.create(
            [{
              _id: _sid,
              gid: gid,
              sid: sid,
              type: cmn.SCHEDULE_STYPE,
              pub: pub,
              oid: oid,
              wgid: _group.gid,
              wmoid: _group.moid,
              pmode: pmode,
              members: members,
              title: title,
              tflg: tflg,
              color: color,
              incount: 0,
              details: {},
              ymd: ymd,
              stime: stime,
              etime: etime,
              ctime: ntime,
              utime: ntime,
              histories: [],
            }],
            { session:session })
          if (!schedule) {
            throw new Error('failed create schedule')
          }
          const newSchedule = schedule[0]

          // トランザクションコミット
          await session.commitTransaction()
          await session.endSession()
          session = null

          // resスケジュールセット
          await scUti.setResSchedule(req, [newSchedule], gid)
          json.schedule = newSchedule

          // スケジュールポーリングデータセット
          cache.setSchedulePollingData(newSchedule, cmn.NEW_PTYPE)
        } else {
          // 編集

          let updateMessage = null
          let newComment = null

          // スケジュール取得
          const setSchedule = await Schedules.findById(sid).session(session)

          const isChangeYmd = (ymd !== setSchedule.ymd) ? true : false

          // スケジュール変更
          // setSchedule.wgid = _group.gid   // 編集時に作成者は変更しない
          // setSchedule.wmoid = _group.moid // 編集時に作成者は変更しない
          setSchedule.pmode = pmode
          setSchedule.title = title
          setSchedule.tflg = tflg
          setSchedule.color = color
          setSchedule.ymd = ymd
          setSchedule.stime = stime
          setSchedule.etime = etime
          
          // メッセージ
          if (setSchedule.mid) {
            // メッセージ取得
            const setMessage = await Messages.findById(setSchedule.mid).session(session)
            
            const beforText = setMessage.sdata.get('text')
            const text = `${scUti.getScheuleMonthDateTimeStr(setSchedule)} ${setSchedule.title}`
            let allccount = setMessage.allccount

            // 絵文字対応するため文字配列にする
            const beforTextAry = [...beforText]
            const textAry = [...text]

            if (beforText !== text) {

              // ObjectId手動生成
              const _cid = new mongoose.Types.ObjectId
              const cid = String(_cid)

              // コメント作成
              const comment = await Comments.create(
                [{
                  _id: _cid,
                  gid: gid,
                  mid: setSchedule.mid,
                  cid: cid,
                  wgid: _group.gid,
                  wmoid: _group.moid,
                  type: cmn.S_EDIT_CTYPE,
                  text: `${beforText} ⇒ ${text}`,
                  blocks: [{ offset:0, len:beforTextAry.length + ` ⇒ `.length + textAry.length, entities:[] }],
                  ctime: ntime,
                  utime: ntime,
                }],
                { session:session }
              )
              if (!comment) {
                throw new Error('failed create comment')
              }
              newComment = comment[0]
              allccount += 1
            }

            // 検索テキスト
            setMessage.stext = msUti.getStext(setMessage.title, setSchedule.title)

            // 公開モード
            setMessage.pmode = pmode
            // スケジュールデータ
            setMessage.sdata = {
              text: text,
              ymd: setSchedule.ymd,
              color: setSchedule.color,
            }
            
            // 関連メンバー
            if (pmode === cmn.MEMBER_PMODE) {
              // 関連オブジェクトセット
              members = [...setMessage.objects]
            }
            setMessage.members = members

            // 全てのコメント数
            setMessage.allccount = allccount
            // 更新時刻
            setMessage.htime = ntime
            setMessage.etime = ntime
            setMessage.utime = ntime

            // メッセージ更新
            updateMessage = await setMessage.save({ session:session })
            if (!updateMessage) {
              throw new Error('failed update message')
            }

            // キャッシュのメッセージ削除
            await cache.deleteData(`msg:${setMessage.mid}`)
          }

          // 関連メンバー
          setSchedule.members = members

          // 更新時刻
          setSchedule.utime = ntime
          
          // スケジュール更新
          const updateSchedule = await setSchedule.save({ session:session })
          if (!updateSchedule) {
            throw new Error('failed update schedule')
          }

          if (isChangeYmd) { // ymdが変更されていたら
            // 取り込みスケジュールを一括更新
            await Schedules.updateMany(
              { rgid:updateSchedule.gid, rsid:updateSchedule.sid },
              { $set: { ymd:updateSchedule.ymd }},
              { runValidator:true }
            ).session(session)
          }
          
          // トランザクションコミット
          await session.commitTransaction()
          await session.endSession()
          session = null

          // resスケジュールセット
          await scUti.setResSchedule(req, [updateSchedule], gid)
          json.schedule = updateSchedule

          // スケジュールポーリングデータセット
          cache.setSchedulePollingData(updateSchedule, cmn.UPDATE_PTYPE)

          if (updateMessage) { // メッセージが更新されたら
            // resメッセージセット
            await msUti.setResMessage(req, [updateMessage], gid, _group)
            json.message = updateMessage

            // メッセージポーリングデータセット
            cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
            // チャットメッセージデータ送信
            chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)
          }
          if (newComment) { // コメントが作成されたら
            // resコメントセット
            await cmUti.setResComment(req, [newComment], gid)
            json.comment = newComment

            // チャットコメントデータ送信
            chat.sendCommentData(newComment, cmn.NEW_PTYPE)
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
        const sid = ckUti.checkId(req.body.sid) ? req.body.sid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !sid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)
        // sidチェック
        const checkSchedule = await apUti.checkSid(json, sid)
        // oidチェック
        const checkObject = await apUti.checkOid(json, gid, checkSchedule.oid)
        // スケジュール表示チェック
        await apUti.checkScheduleView(req, json, checkSchedule, _group)
        // スケジュール編集チェック
        await apUti.checkScheduleEdit(json, _group, checkObject, checkSchedule)
        
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
        
        let updateMessage = null
        let newComment = null

        // スケジュール取得
        const setSchedule = await Schedules.findById(sid).session(session)

        // メッセージ
        if (setSchedule.mid) {
          // メッセージ取得
          const setMessage = await Messages.findById(setSchedule.mid).session(session)

          const text = setMessage.sdata.get('text')

          // 絵文字対応するため文字配列にする
          const textAry = [...text]

          // ObjectId手動生成
          const _cid = new mongoose.Types.ObjectId
          const cid = String(_cid)

          // コメント作成
          const comment = await Comments.create(
            [{
              _id: _cid,
              gid: gid,
              mid: setSchedule.mid,
              cid: cid,
              wgid: _group.gid,
              wmoid: _group.moid,
              type: cmn.S_DELETE_CTYPE,
              text: text,
              blocks: [{ offset:0, len:textAry.length, entities:[] }],
              ctime: ntime,
              utime: ntime,
            }],
            { session:session }
          )
          if (!comment) {
            throw new Error('failed create comment')
          }
          newComment = comment[0]

          // スケジュールメッセージはschedule.oidがmessage.objectsに追加されるが、本文中になければobjectsのschedule.oidを削除

          // objectsのスケジュールoidを削除
          let isDelete = true
          // 書き込みメンバーoidチェック
          if (setMessage.wmoid === setSchedule.oid) isDelete = false
          // エンティティチェック
          const blocks = setMessage.blocks
          for (let i = 0; i < blocks.length; i++) {
            const entities = blocks[i].entities
            for (let j = 0; j < entities.length; j++) {
              const type = Number(entities[j].get('type'))
              if (type !== cmn.FILE_OTYPE) {
                const dataOid = entities[j].get('data').get('oid')
                if (dataOid === setSchedule.oid) {
                  isDelete = false
                  break
                }
              }
            }
          }
          // 削除可能なら削除
          if (isDelete) {
            const index = setMessage.objects.indexOf(setSchedule.oid)
            if (index > -1) {
              setMessage.objects.splice(index, 1)
            }
          }
          
          setMessage.stext = msUti.getStext(setMessage.title, '')
          setMessage.sid = ''
          setMessage.soid = ''
          setMessage.sdata = {}
          setMessage.allccount += 1
          
          // 更新時刻
          setMessage.htime = ntime
          setMessage.etime = ntime
          setMessage.utime = ntime

          // メッセージ更新
          updateMessage = await setMessage.save({ session:session })
          if (!updateMessage) {
            throw new Error('failed update message')
          }
        }

        // スケジュール削除
        const deleteSchedule = await dbUti.deleteSchedule(setSchedule, session)
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null
        
        json.schedule = null

        // スケジュールポーリングデータセット
        cache.setSchedulePollingData(deleteSchedule, cmn.DELETE_PTYPE)

        if (updateMessage) { // メッセージが更新されたら
          // resメッセージセット
          await msUti.setResMessage(req, [updateMessage], gid, _group)
          json.message = updateMessage
          
          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)
        }
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

// 自分のスケジュールに追加
router.post('/add', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)
        
        const sgid = ckUti.checkId(req.body.sgid) ? req.body.sgid : '' // 選択gid
        const moid = ckUti.checkId(req.body.moid) ? req.body.moid : ''
        const sid = ckUti.checkId(req.body.sid) ? req.body.sid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!sgid || !moid || !sid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // グループとメンバーチェック(グループは所属か公開)
        const _group = await apUti.checkGroupWithMember(req, json, sgid, moid)

        // sidチェック
        const checkSchedule = await apUti.checkSid(json, sid)
        // 対象オブジェクトチェック
        if (checkSchedule.oid === _group.moid) { // 自分
          json.code = 400
          throw new Error('invalid sid')
        }
        // スケジュール表示チェック
        await apUti.checkScheduleView(req, json, checkSchedule, _group)

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
        
        // スケジュール取得
        const setSchedule = await Schedules.findById(sid).session(session)

        let newInSchedule = null
        let updateMessage = null
        
        // 取り込みスケジュール取得
        const checkInSchedule = await Schedules.findOne({ gid:_group.gid, oid:_group.moid, rsid:sid, type:cmn.INSCHEDULE_STYPE }).select('_id').session(session)
        if (!checkInSchedule) {

          // ObjectId手動生成
          const _inSid = new mongoose.Types.ObjectId
          const inSid = String(_inSid)

          // 取り込みスケジュール作成
          const newInSchedules = await Schedules.create(
            [{
              _id: _inSid,
              gid: _group.gid,
              sid: inSid,
              type: cmn.INSCHEDULE_STYPE,
              pub: false,
              oid: _group.moid,
              wgid: _group.gid,
              wmoid: _group.moid,
              rgid: setSchedule.gid,
              rsid: setSchedule.sid,
              roid: setSchedule.oid,
              pmode: cmn.NONE_PMODE,
              tflg: cmn.NONE_TFLG,
              color: cmn.SCH_NONE_COLOR,
              ymd: setSchedule.ymd,
              stime: 0,
              etime: 0,
              ctime: ntime,
              utime: ntime,
            }],
            { session:session })
          if (!newInSchedules) {
            throw new Error('failed create schedule')
          }
          newInSchedule = newInSchedules[0]

          // 取り込み数
          setSchedule.incount += 1
          // 更新時刻
          setSchedule.utime = ntime
          // スケジュール更新
          const updateSchedule = await setSchedule.save({ session:session })
          if (!updateSchedule) {
            throw new Error('failed update schedule')
          }

          // 取り込みスケジュールセットでセットする為にinschをセット
          newInSchedule._doc.insch = [updateSchedule._doc]

          if (setSchedule.mid) { // スケジュールメッセージがあれば
            updateMessage = await Messages.findById(setSchedule.mid).session(session)
            // 取込みスケジュールセット
            updateMessage._doc.isinsch = true
          }
        } else {
          json.isExists = true
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        if (newInSchedule) {
          // グループの関連oid配列取得
          const groupOidArray = await apUti.getGroupOidArray(req, sgid, _group)
          // 取り込みスケジュールセット
          _setInSchedule([newInSchedule], sgid, groupOidArray)
          // resスケジュールセット
          await scUti.setResSchedule(req, [newInSchedule], sgid)
          json.schedule = newInSchedule

          // スケジュールポーリングデータセット
          cache.setSchedulePollingData(newInSchedule, cmn.NEW_PTYPE)
        }
        if (updateMessage) {
          // resメッセージセット
          await msUti.setResMessage(req, [updateMessage], sgid, _group)
          json.message = updateMessage

          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)
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

// 自分のスケジュールから取り除く
router.post('/remove', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)
        
        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''
        const sid = ckUti.checkId(req.body.sid) ? req.body.sid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid || !sid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        const _group = apUti.checkBelongGroup(req, json, gid)

        // sidチェック
        const checkSchedule = await apUti.checkSid(json, sid)
        // 取り込みスケジュールチェック
        if (checkSchedule.wgid !== _group.gid || checkSchedule.wmoid !== _group.moid || checkSchedule.type !== cmn.INSCHEDULE_STYPE) {
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

        // 取り込みスケジュール取得
        const setInSchedule = await Schedules.findById(sid).session(session)
        const rsid = setInSchedule.rsid
        // 取込みスケジュール削除
        const deleteInSchedule = await dbUti.deleteSchedule(setInSchedule, session)

        let updateSchedule = null
        let updateMessage = null

        // 取り込み先スケジュール取得
        const setSchedule = await Schedules.findById(rsid).session(session)
        if (setSchedule) {
          // 取り込み数
          setSchedule.incount -= 1
          // 更新時刻
          setSchedule.utime = ntime

          // スケジュール更新
          updateSchedule = await setSchedule.save({ session:session })
          if (!updateSchedule) {
            throw new Error('failed update schedule')
          }

          if (setSchedule.mid) { // スケジュールメッセージがあれば
            updateMessage = await Messages.findById(setSchedule.mid).session(session)
            // 取込みスケジュールセット
            updateMessage._doc.isinsch = false
          }
        }
        
        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.result = 1

        // スケジュールポーリングデータセット
        cache.setSchedulePollingData(deleteInSchedule, cmn.DELETE_PTYPE)

        if (updateSchedule) {
          // resスケジュールセット
          await scUti.setResSchedule(req, [updateSchedule], gid)
          json.schedule = updateSchedule
          
          // スケジュールポーリングデータセット
          cache.setSchedulePollingData(updateSchedule, cmn.UPDATE_PTYPE)
        }
        if (updateMessage) {
          // resメッセージセット
          await msUti.setResMessage(req, [updateMessage], gid, _group)
          json.message = updateMessage

          // メッセージポーリングデータセット
          cache.setMessagePollingData(updateMessage, cmn.UPDATE_PTYPE)
          // チャットメッセージデータ送信
          chat.sendMessageData(updateMessage, cmn.UPDATE_PTYPE)
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

//#endregion

/*--------------------------------------------------*/

module.exports = router

const cmn = require('../common')
const cache = require('../cache') 
const dtUti = require('../datetime-util')
const ckUti = require('../check-util')
const apUti = require('../api-util')
const mlUti = require('../mail-util')

const express = require('express')
const router = express.Router()

// ハッシュ
const bcrypt = require('bcrypt')

// MongoDB
const mongoose = require('mongoose')
const db = mongoose.connection

// スキーマ
const Signups = require('../schema/signups')
const Forgotpasswords = require('../schema/forgotpasswords')
const Accounts = require('../schema/accounts')
const Groups = require('../schema/groups')
const Members = require('../schema/members')
const Objects = require('../schema/objects')
const Messages = require('../schema/messages')

/*--------------------------------------------------*/
//#region GET

// ログインアカウント
router.get('/login_account', function(req, res, next) {
  if (req.session.account) {
    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        /*--------------------------------------------------*/

        // アカウント取得
        const checkAccount = await Accounts.findById(req.session.account.aid).select('-password -birthday -ctime -logs')

        // 選択gid
        const sgid = (req.session.account) ? req.session.account.sgid : checkAccount.dgid

        // ログインセッションセット
        await apUti.setLoginSession(req, res, checkAccount)

        // 選択gidセット
        req.session.account.sgid = sgid

        json.account = req.session.account
      } catch(err) {
        // エラーログ書き込み
        cmn.writeErrorlog(req, json, err)
      } finally {
        // JSON送信
        apUti.sendJSON(res, json)
      }
    }

    doAsync(req, res)
  } else {
    const json = { code:200, errors:{} }
    json.result = '1'
    // JSON送信
    apUti.sendJSON(res, json)
  }
})

// ポーリング
router.get('/polling', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        const gid = ckUti.checkId(req.query.gid) ? req.query.gid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid get')
        }

        // 所属グループチェック
        apUti.checkBelongGroup(req, json, gid)
        
        /*--------------------------------------------------*/

        // ポーリングデータ取得
        const data = await cache.getPollingData(gid)

        json.update = data
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

// パスワード忘れ表示
router.get('/forgot_password/:fpid', function(req, res, next) {
    
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    try {
      const fpid = ckUti.checkId(req.params.fpid) ? req.params.fpid : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!fpid) {
        json.code = 400
        throw new Error('invalid get')
      }

      // パスワード忘れデータチェック
      const checkForgotpassword = await Forgotpasswords.findById(fpid).select('ltime')
      if (checkForgotpassword) {
        if (checkForgotpassword.ltime < dtUti.getNowUtime()) {
          json.message = 'リンクの有効期限切れの為、もう一度最初からやり直してください'
          throw new Error('failed forgot password timeup')
        }
      } else {
        json.code = 400
        throw new Error('invalid fpid')
      }

      json.fpid = fpid

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

// POST前
router.get('/befor_post', function(req, res, next) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        // トークンセット
        const token = await apUti.setToken(req, res)
        json.token = token
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

// ログイン
router.post('/login', function(req, res) {

  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    let session = null
    try {
      console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

      const mail = ckUti.checkStr(req.body.mail) ? req.body.mail : ''
      const password = ckUti.checkStr(req.body.password) ? req.body.password : ''
      const os = ckUti.checkStr(req.body.os) ? req.body.os : ''

      //--------------------------------------------------
      // チェック

      // 必須チェック
      if (!mail || !password) {
        json.code = 400
        throw new Error('invalid post')
      }

      // メールアドレスチェック
      apUti.checkMail(json, mail)
      // パスワードチェック
      apUti.checkPassword(json, password, 'password')
      // OSチェック
      if (os) {
        if (os !== cmn.IOS_OS && os !== cmn.ANDROID_OS && os !== cmn.WEB_OS ) {
          json.code = 400
          throw new Error('invalid os')
        }
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
      
      // アカウント取得
      const checkAccount = await Accounts.findOne({ mail: mail }).select('-birthday -ctime -logs').session(session)
      if (checkAccount) {

        // パスワードチェック
        const isLogin = await bcrypt.compare(password, checkAccount.password)
        if (isLogin) {
          // ログインセッションセット
          await apUti.setLoginSession(req, res, checkAccount)

          // OSセット
          if (os) req.session.os = os

          json.account = req.session.account

          // アカウント取得
          const setAccount = await Accounts.findById(checkAccount.aid).session(session)

          // ログインログ追加
          setAccount.logs.unshift({
            ctime: dtUti.getNowUtime(),
            ip: cmn.getReqIp(req),
            ua: req.headers['user-agent'],
            ssid: req.sessionID,
          })
          while (setAccount.logs.length > 10) { // ログインログは10まで
            setAccount.logs.pop()
          }
          
          // アカウント更新
          const updateAccount = await setAccount.save({ session:session })
          if (!updateAccount) {
            throw new Error('failed update account')
          }
        } else {
          json.errors.result = 'メールアドレスかパスワードが間違ってます'
        }
      } else {
        json.errors.result = 'メールアドレスかパスワードが間違ってます'
      }

      // トランザクションコミット
      await session.commitTransaction()
      await session.endSession()
      session = null

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
})

// ログアウト
router.post('/logout', function(req, res) {
  const doAsync = async (req, res) => {
    if (apUti.checkLogin(req, res)) {
      // セッションクリア
      await req.session.destroy()
      
      const json = { code:200, errors:{} }
      json.result = '1'
      // JSON送信
      apUti.sendJSON(res, json)
    }
  }

  doAsync(req, res)
})

// サインアップ
router.post('/signup', function(req, res) {

  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    let session = null
    try {
      console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

      const mail = ckUti.checkStr(req.body.mail) ? req.body.mail : ''
      const password = ckUti.checkStr(req.body.password) ? req.body.password : ''
      const name = ckUti.checkStr(req.body.name) ? req.body.name : ''
      const birthday = ckUti.checkStr(req.body.birthday) ? req.body.birthday : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!mail || !password || !name || !birthday) {
        json.code = 400
        throw new Error('invalid post')
      }

      // メールアドレスチェック
      apUti.checkMail(json, mail)
      // パスワードチェック
      apUti.checkPassword(json, password, 'password')
      // 名前チェック
      apUti.checkStrLength(json, name, 25, 'name')
      // 生年月日チェック
      apUti.checkBirthday(json, birthday)

      // アカウント存在チェック
      const checkAccount = await Accounts.findOne({ mail: mail }).select('_id')
      if (checkAccount) {
        json.errors.mail = 'メールアドレスは既に使用されています'
        throw new Error('failed signup email')
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
      
      // ObjectId手動生成
      const _id = new mongoose.Types.ObjectId
      const id = String(_id)
      
      // パスワードにハッシュをかける
      const hash = await bcrypt.hash(password, 10)
      if (!hash) {
        throw new Error('failed hash password')
      }

      // 認証コード6桁
      const  arr = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
      let code = ''
      for (let i = 0; i < 6; i++) {
        code += `${arr[Math.floor( Math.random() * arr.length)]}`
      }

      // 現在の時間
      const ntime = dtUti.getNowUtime()

      // 期限時間
      const ldt = new Date()
      ldt.setMinutes(ldt.getMinutes() + cmn.MAIL_CHECK_LIMIT_MIN)
      const ltime = dtUti.getTimeToUtime(ldt.getTime())

      // サインアップ作成
      const newSignup = await Signups.create(
        [{
          _id: _id,
          mail: mail,
          password: hash,
          name: name,
          birthday: dtUti.getDateToYmd(dtUti.checkDateStrToDate(birthday)),
          code: code,
          ctime: ntime,
          ltime: ltime,
        }],
        { session:session }
      )
      if (!newSignup) {
        throw new Error('failed create signup')
      }

      // トランザクションコミット
      await session.commitTransaction()
      await session.endSession()
      session = null

      json.suid = id

      let to = mail
      if (process.env.TEST_MAIL) to = process.env.TEST_MAIL
      const subject = 'メールアドレスの検証'
      const text = `お客様が本人であることを確認させていただくため、認証コード入力欄が表示されたら次の数字を入力してください。\n\n${code}\n(このコードは${cmn.MAIL_CHECK_LIMIT_MIN}分間有効です)`
      // メール送信
      mlUti.sendMail(to, subject, text)
      
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
})

// サインアップ登録コードチェック
router.post('/signup/checkcode', function(req, res) {
  
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    let session = null
    try {
      console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

      const suid = ckUti.checkId(req.body.suid) ? req.body.suid : ''
      const code = ckUti.checkStr(req.body.code) ? req.body.code : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!suid || !code) {
        json.code = 400
        throw new Error('invalid post')
      }

      // サインアップデータチェック
      const checkSignup = await Signups.findById(suid).select('mail code ltime')
      if (checkSignup) {
        if (checkSignup.ltime < dtUti.getNowUtime()) {
          json.errors.code = '認証コードの有効期限切れの為、もう一度最初からやり直してください'
          throw new Error('failed signup timeup')
        }
        ///////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////
        // TODO
        // 一時的に123456が通るようにする
        ///////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////
        //if (checkSignup.code !== code) {
        if (checkSignup.code !== code && code !== '123456') {
          json.errors.code = '認証コードが間違っています'
          throw new Error('failed signup code')
        }
      } else {
        json.code = 400
        throw new Error('invalid signup id')
      }

      // アカウント存在チェック
      const checkAccount = await Accounts.findOne({ mail: checkSignup.mail }).select('_id')
      if (checkAccount) {
        json.errors.code = 'メールアドレスは既に使用されています'
        throw new Error('failed signup email')
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
      const _aid = new mongoose.Types.ObjectId
      const _gid = new mongoose.Types.ObjectId
      const _goid = new mongoose.Types.ObjectId
      const _mid = new mongoose.Types.ObjectId
      const _moid = new mongoose.Types.ObjectId
      const _msgid = new mongoose.Types.ObjectId
      const aid = String(_aid)
      const gid = String(_gid)
      const goid = String(_goid)
      const mid = String(_mid)
      const moid = String(_moid)
      const msgid = String(_msgid)
      
      // 公開ID生成
      const pid = await apUti.generatePid(session)

      // サインアップ取得
      const setSignup = await Signups.findById(suid).session(session)

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
          name: setSignup.name,
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
          pmid: pid,
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
          type: cmn.MGROUP_OTYPE, // マイグループ
          image: '',
          icon: '',
          name: setSignup.name,
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
          pgid: pid, // マイグループはpgidとメンバーのpmidが同じになる
          mode: cmn.MYGROUP_GMODE,
          status: cmn.NORMAL_GSTATUS,
          pub: false,
          name: setSignup.name,
          settings: {
            maxmem: cmn.MAX_MEM,
            maxobj: cmn.MAX_OBJ,
            maxstar: cmn.MAX_STAR,
            filecapa: cmn.FILE_CAPA,
            filesize: 0
          },
          ctime: ntime,
          utime: ntime,
        }],
        { session:session }
      )
      if (!newGroup) {
        throw new Error('failed create group')
      }

      // アカウント作成
      const newAccount = await Accounts.create(
        [{
          _id: _aid,
          aid: aid,
          mail: setSignup.mail,
          password: setSignup.password,
          name: setSignup.name,
          birthday: setSignup.birthday,
          settings: {
            maxgp: cmn.MAX_GP,
          },
          dgid: gid,
          groups: [{
            gid: gid,
            goid: goid,
            mid: mid,
            moid: moid,
          }],
          ctime: ntime,
          utime: ntime,
          logs: [],
        }],
        { session:session }
      )
      if (!newAccount) {
        throw new Error('failed create account')
      }

      // サインアップ削除
      const deleteSignup = await setSignup.deleteOne({ session:session })
      if (!deleteSignup) {
        throw new Error('failed delete signup')
      }

      // ようこそメッセージ作成

      const name = setSignup.name
      const nameAry = [...setSignup.name] // 絵文字対応するため文字配列にする

      const blocks = []
      let str = ''
      let len = 0
      let text = ''
      let offset = 0

      str = `${name} さん`
      len = nameAry.length + ` さん`.length
      text += str
      blocks.push({ offset:offset, len:len, entities:[{type: cmn.MEMBER_OTYPE, offset:offset, len:nameAry.length, data:{ oid:moid, icon:'', name:name }}] })
      offset += len

      str = `最初のグループはメンバーを追加できないマイグループです。公開することによってSNSとして使えます。`
      len = str.length
      text += str
      blocks.push({ offset:offset, len:len, entities:[] })
      offset += len

      str = ``
      len = str.length
      text += str
      blocks.push({ offset:offset, len:len, entities:[] })
      offset += len

      str = `新たにグループウェアやホームページを始める場合は新規グループを作成しましょう！`
      len = str.length
      text += str
      blocks.push({ offset:offset, len:len, entities:[] })

      const titleStr = `${cmn.SYSTEM_NAME}へようこそ！`
      
      const message = await Messages.create(
        [{
          _id: _msgid,
          gid: gid,
          mid: msgid,
          mkey: cmn.generateReverseObjectId(),
          type: cmn.MESSAGE_MTYPE,
          status: cmn.NOMAL_MSTATSU,
          pub: false,
          wgid: cmn.SYSTEM_GID,
          wmoid: cmn.SYSTEM_OID,
          stext: titleStr,
          pmode: cmn.MEMBER_PMODE,
          members: [moid],
          objects: [moid],
          title: titleStr,
          text: text,
          blocks: blocks,
          ctime: ntime,
          etime: ntime,
          htime: ntime,
          utime: ntime,
        }],
        { session:session })
      if (!message) {
        throw new Error('failed create message')
      }

      // トランザクションコミット
      await session.commitTransaction()
      await session.endSession()
      session = null

      // ログインセッションセット
      await apUti.setLoginSession(req, res, newAccount[0])

      json.account = req.session.account
      
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
})

// パスワード忘れ
router.post('/forgot_password', function(req, res) {

  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    let session = null
    try {
      console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

      const mail = ckUti.checkStr(req.body.mail) ? req.body.mail : ''
      
      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!mail) {
        json.code = 400
        throw new Error('invalid post')
      }

      // メールアドレスチェック
      apUti.checkMail(json, mail)
      
      // アカウント存在チェック
      const checkAccount = await Accounts.findOne({ mail: mail }).select('_id')
      if (!checkAccount) {
        json.errors.mail = 'このメールアドレスで登録されたアカウントは存在しません'
        throw new Error('invalid mail')
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
      
      // ObjectId手動生成
      const _id = new mongoose.Types.ObjectId
      const id = String(_id)
      
      // 現在の時間
      const ntime = dtUti.getNowUtime()

      // 期限時間
      const ldt = new Date()
      ldt.setMinutes(ldt.getMinutes() + cmn.FORGOT_PASSWORD_CHECK_LIMIT_MIN)
      const ltime = dtUti.getTimeToUtime(ldt.getTime())

      // パスワード忘れ作成
      const newForgotpasswords = await Forgotpasswords.create(
        [{
          _id: _id,
          mail: mail,
          ctime: ntime,
          ltime: ltime,
        }],
        { session:session }
      )
      if (!newForgotpasswords) {
        throw new Error('failed forgot password')
      }

      // トランザクションコミット
      await session.commitTransaction()
      await session.endSession()
      session = null

      const url = `${cmn.SERVER_NAME}/reset_password?id=${id}`

      let to = mail
      if (process.env.TEST_MAIL) to = process.env.TEST_MAIL
      const subject = 'パスワードのリセット'
      const text = `以下のリンクをクリックするとパスワードがリセットできます。 \n${url}\n(このリンクは${cmn.FORGOT_PASSWORD_CHECK_LIMIT_MIN}分間有効です)\nパスワードのリセットをご希望でない場合、このメールは削除してください。\n`
      // メール送信
      mlUti.sendMail(to, subject, text)

      json.message = 'メールが送信されました'
      
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
})

// パスワードリセット
router.post('/password/reset', function(req, res) {
  
  const doAsync = async (req, res) => {
    const json = { code:200, errors:{} }
    let session = null
    try {
      console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

      const fpid = ckUti.checkId(req.body.fpid) ? req.body.fpid : ''
      const password = ckUti.checkStr(req.body.password) ? req.body.password : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!fpid || !password) {
        json.code = 400
        throw new Error('invalid post')
      }

      // パスワードチェック
      apUti.checkPassword(json, password, 'password')

      // パスワード忘れデータチェック
      const checkForgotpassword = await Forgotpasswords.findById(fpid).select('mail ltime')
      if (checkForgotpassword) {
        if (checkForgotpassword.ltime < dtUti.getNowUtime()) {
          json.errors.result = 'リンクの有効期限切れの為、もう一度最初からやり直してください'
          throw new Error('failed forgot password timeup')
        }
      } else {
        json.code = 400
        throw new Error('invalid fpid')
      }

      // アカウント存在チェック
      const checkAccount = await Accounts.findOne({ mail: checkForgotpassword.mail }).select('_id')
      if (!checkAccount) {
        json.code = 400
        throw new Error('invalid forgot password')
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

      // パスワード忘れデータ
      const setForgotpassword = await Forgotpasswords.findById(fpid).session(session)
      
      // パスワードにハッシュをかける
      const hash = await bcrypt.hash(password, 10)
      if (!hash) {
        throw new Error('failed hash password')
      }

      // アカウント取得
      const setAccount = await Accounts.findOne({ mail: setForgotpassword.mail }).session(session)
      // パスワード変更
      setAccount.password = hash
      setAccount.utime = ntime
      // アカウント更新
      const updateAccount = await setAccount.save({ session:session })
      if (!updateAccount) {
        throw new Error('failed update account')
      }

      // パスワード忘れ削除
      const deleteForgotpassword = await setForgotpassword.deleteOne({ session:session })
      if (!deleteForgotpassword) {
        throw new Error('failed delete forgot password')
      }

      // トランザクションコミット
      await session.commitTransaction()
      await session.endSession()
      session = null

      json.result = '1'
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
})

//#endregion

/*--------------------------------------------------*/

module.exports = router

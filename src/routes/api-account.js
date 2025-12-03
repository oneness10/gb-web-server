const cmn = require('../common')
const cache = require('../cache') 
const ckUti = require('../check-util')
const apUti = require('../api-util')
const mlUti = require('../mail-util')
const dbUti = require('../db-util')
const dtUti = require('../datetime-util')

const express = require('express')
const router = express.Router()

// ハッシュ
const bcrypt = require('bcrypt')

// MongoDB
const mongoose = require('mongoose')
const db = mongoose.connection

// スキーマ
const Accounts = require('../schema/accounts')
const Changemails = require('../schema/changemails')
const Groups = require('../schema/groups')
const Objects = require('../schema/objects')

/*--------------------------------------------------*/
//#region POST

// メールアドレス変更
router.post('/mail/change', function(req, res) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const aid = ckUti.checkId(req.body.aid) ? req.body.aid : ''
        const mail = ckUti.checkStr(req.body.mail) ? req.body.mail : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!aid || !mail) {
          json.code = 400
          throw new Error('invalid post')
        }

        // aidチェック
        apUti.checkAid(req, json, aid)
        // メールアドレスチェック
        apUti.checkMail(json, mail)

        // aidが自分かチェック
        if (aid !== req.session.account.aid) {
          json.code = 400
          throw new Error('invalid not self aid')
        }

        // アカウント存在チェック
        const checkAccount = await Accounts.findOne({mail: mail}).select('aid')
        if (checkAccount && checkAccount.aid !== req.session.account.aid) {
          json.errors.mail = 'メールアドレスは既に使用されています'
          throw new Error('failed change email')
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
        const _cmid = new mongoose.Types.ObjectId
        const cmid = String(_cmid)
        
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

        // メールアドレス変更作成
        const newChangemail = await Changemails.create(
          [{
            _id: _cmid,
            aid: aid,
            mail: mail,
            code: code,
            ctime: ntime,
            ltime: ltime,
          }],
          { session:session }
        )
        if (!newChangemail) {
          throw new Error('failed create change mail')
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        json.cmid = cmid

        let to = mail
        if (process.env.TEST_MAIL) to = process.env.TEST_MAIL
        const subject = 'メールアドレスの検証'
        const text = `お客様が本人であることを確認させていただくため、認証コード入力欄が表示されたら次の数字を入力してください。\n\n${code}\n(このコードは${cmn.MAIL_CHECK_LIMIT_MIN}分間有効です)`
        // メール送信
        mlUti.sendMail(to, subject, text)

        // 現在のアカウント以外は変更が無いのでセッション更新のポーリングデータは送らない
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

// メールアドレス変更登録コードチェック
router.post('/mail_checkcode/change', function(req, res) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {
  
    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const cmid = ckUti.checkId(req.body.cmid) ? req.body.cmid : ''
        const code = ckUti.checkStr(req.body.code) ? req.body.code : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!cmid || !code) {
          json.code = 400
          throw new Error('invalid post')
        }

        // メールアドレス変更データチェック
        const checkChangemail = await Changemails.findById(cmid).select('mail code ltime')
        if (checkChangemail) {
          if (checkChangemail.ltime < dtUti.getNowUtime()) {
            json.errors.code = '認証コードの有効期限切れの為、もう一度最初からやり直してください'
            throw new Error('failed change mail timeup')
          }
          if (checkChangemail.code !== code) {
            json.errors.code = '認証コードが間違っています'
            throw new Error('failed change mail code')
          }
        } else {
          json.code = 400
          throw new Error('invalid change mial id')
        }

        // アカウント存在チェック
        const checkAccount = await Accounts.findOne({mail: checkChangemail.mail}).select('aid')
        if (checkAccount && checkAccount.aid !== req.session.account.aid) {
          json.errors.code = 'メールアドレスは既に使用されています'
          throw new Error('failed chagne email')
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

        // メール変更取得
        const setChangemail = await Changemails.findById(cmid).session(session)

        // アカウント取得
        const setAccount = await Accounts.findById(setChangemail.aid).session(session)

        const mail = setChangemail.mail 

        setAccount.mail = mail
        setAccount.utime = ntime
        // アカウント更新
        const updateAccount = await setAccount.save({ session:session })
        if (!updateAccount) {
          throw new Error('failed update account')
        }

        // メール変更削除
        const deleteChangemail = await setChangemail.deleteOne({ session:session })
        if (!deleteChangemail) {
          throw new Error('failed delete change mail')
        }

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // セッション更新
        req.session.account.mail = mail
        req.session.account.utime = ntime

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
  }
})

// パスワード変更
router.post('/password/change', function(req, res) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const aid = ckUti.checkId(req.body.aid) ? req.body.aid : ''
        const now_password = ckUti.checkStr(req.body.now_password) ? req.body.now_password : ''
        const new_password = ckUti.checkStr(req.body.new_password) ? req.body.new_password : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!aid || !now_password || !new_password) {
          json.code = 400
          throw new Error('invalid post')
        }

        // aidチェック
        apUti.checkAid(req, json, aid)
        // 現在のパスワードチェック
        apUti.checkPassword(json, now_password, 'now_password')
        // 新しいパスワードチェック
        apUti.checkPassword(json, new_password, 'new_password')

        // aidが自分かチェック
        if (aid !== req.session.account.aid) {
          json.code = 400
          throw new Error('invalid not self aid')
        }

        /*--------------------------------------------------*/
        
        // アカウント取得
        const setAccount = await Accounts.findById(req.session.account.aid)
        if (!setAccount) {
          throw new Error('failed find account')
        }
        // パスワードチェック
        const isLogin = await bcrypt.compare(now_password, setAccount.password)
        if (isLogin) {

          // 現在の時間
          const ntime = dtUti.getNowUtime()

          // パスワードにハッシュをかける
          const hash = await bcrypt.hash(new_password, 10)
          if (!hash) {
            throw new Error('failed password hash')
          }
          setAccount.password = hash
          setAccount.utime = ntime
          // アカウント更新
          const updateAccount = await setAccount.save()
          if (!updateAccount) {
            throw new Error('failed update account')
          }

          // セッション更新
          req.session.account.utime = ntime

          json.account = req.session.account
        } else {
          json.errors.nowPassword = '現在のパスワードが間違ってます'
        }

        // 現在のアカウント以外は変更が無いのでセッション更新のポーリングデータは送らない
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

// 名前変更
router.post('/name/change', function(req, res) {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const aid = ckUti.checkId(req.body.aid) ? req.body.aid : ''
        const name = ckUti.checkStr(req.body.name) ? req.body.name : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!aid || !name) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // aidチェック
        apUti.checkAid(req, json, aid)
        // 名前チェック
        apUti.checkStrLength(json, name, 25, 'name')

        // aidが自分かチェック
        if (aid !== req.session.account.aid) {
          json.code = 400
          throw new Error('invalid not self aid')
        }

        /*--------------------------------------------------*/

        // アカウント取得
        const setAccount = await Accounts.findById(req.session.account.aid)
        if (!setAccount) {
          throw new Error('failed find account')
        }

        // 現在の時間
        const ntime = dtUti.getNowUtime()

        setAccount.name = name
        setAccount.utime = ntime
        // アカウント更新
        const updateAccount = await setAccount.save()
        if (!updateAccount) {
          throw new Error('failed update account')
        }

        // セッション更新
        req.session.account.name = name
        req.session.account.utime = ntime

        json.account = req.session.account

        // 現在のアカウント以外は変更が無いのでセッション更新のポーリングデータは送らない
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

// 削除
router.post('/delete', (req, res, next) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      let session = null
      try {
        console.log(`${req.originalUrl} ${req.method} ${JSON.stringify(req.body)}`)

        const aid = ckUti.checkId(req.body.aid) ? req.body.aid : ''

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!aid) {
          json.code = 400
          throw new Error('invalid post')
        }
        
        // aidチェック
        apUti.checkAid(req, json, aid)
        
        // aidが自分かチェック
        if (aid !== req.session.account.aid) {
          json.code = 400
          throw new Error('invalid not self aid')
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

        const deleteIds = []
        const updateIds = []

        // グループ削除
        for (let accountGroup of req.session.account.groups) {
          
          if (accountGroup.ooid === accountGroup.moid) {
            // オーナーグループ

            const gid = accountGroup.gid
            const goid = accountGroup.goid
            deleteIds.push({ gid:gid, oid:goid })

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
          } else {
            // 所属グループ(オーナーではない)

            const gid = accountGroup.gid
            const moid = accountGroup.moid
            updateIds.push({ gid:gid, oid:moid })

            // メンバーオブジェクト取得
            const setMemberObject = await Objects.findOne({ gid:gid, oid:moid }).session(session)
            // 状態セット
            setMemberObject.status = cmn.DELETE_OSTATUS // アカウント削除
            setMemberObject.utime = ntime
            // メンバーオブジェクト更新
            const updateMemberObject = await setMemberObject.save({ session:session })
            if (!updateMemberObject) {
              throw new Error('failed update member object')
            }
          }
        }

        // アカウント取得
        const setAccount = await Accounts.findById(aid).session(session)
        // アカウント削除
        await dbUti.deleteAccount(setAccount, session)

        // トランザクションコミット
        await session.commitTransaction()
        await session.endSession()
        session = null

        // セッションクリア
        delete req.session.account
        
        json.utime = ntime

        // 削除グループオブジェクト
        for (let deleteId of deleteIds) {
          // オブジェクトポーリングデータセット
          cache.setObjectPollingData(deleteId.gid, { oid:deleteId.oid, utime:ntime }, cmn.DELETE_PTYPE)
        }
        // 更新メンバーオブジェクト
        for (let updateId of updateIds) {
          // オブジェクトポーリングデータセット
          cache.setObjectPollingData(updateId.gid, { oid:updateId.oid, utime:ntime }, cmn.UPDATE_PTYPE)
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

const cmn = require('../common')
const cache = require('../cache') 
const ckUti = require('../check-util')
const flUti = require('../file-util')

const express = require('express')
const router = express.Router()

// スキーマ
const Messages = require('../schema/messages')
const Comments = require('../schema/comments')

// S3
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const s3Client = flUti.s3Client

/*--------------------------------------------------*/

// グループチェック
const _checkGroup = async (req, gid) => {
  
  // アカウントグループ取得
  const _group = cmn.getAccountGroup(req, gid)
  if (_group) {
    return _group
  } else {
    // キャッシュからグループ取得
    const cacheGroup = await cache.getGroup(gid)
    if (cacheGroup && (cmn.checkAdminAccount(req) || cacheGroup.pub)) { // 管理アカウント、公開中
      return cacheGroup
    }
  }

  throw new Error('invalid gid')
}

/*--------------------------------------------------*/
//#region GET

// 一時画像
router.get('/tempimage/:fname', (req, res, next) => {

  const doAsync = async (req, res) => {
    let code = 404
    try {
      const fname = ckUti.checkStr(req.params.fname) ? req.params.fname : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!fname) {
        code = 400
        throw new Error('invalid get')
      }

      /*--------------------------------------------------*/

      const bucketParams = {
        Bucket: cmn.AWS_S3_TEMP_BUCKET,
        Key: `${fname}`
      }
  
      // オブジェクト取得
      const data = await s3Client.send(new GetObjectCommand(bucketParams)) // 無ければエラー発生
      if (data) {
        res.status(200)
        data.Body.pipe(res)
      }
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, { code:code, error:{} }, err)
      res.status(code).send()
    }
  }

  doAsync(req, res)
})

// 画像
router.get('/image/:mid/:fname', (req, res, next) => {
  
  const doAsync = async (req, res) => {
    let code = 404
    try {
      const mid = ckUti.checkId(req.params.mid) ? req.params.mid : ''
      const fname = ckUti.checkStr(req.params.fname) ? req.params.fname : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!mid || !fname) {
        code = 400
        throw new Error('invalid get')
      }

      // キャッシュからメッセージ取得
      const message = await cache.getMessage(mid)
      if (!message) {
        throw new Error('not found mid')
      }
      if (message.type !== cmn.DM_MTYPE) {
        // グループチェック(非公開になっている場合あり、その場合404)
        await _checkGroup(req, message.gid)
      } else {
        // ダイレクトメッセージ
        if (!cmn.getAccountGroupMember(req, message.objects[0]) && !cmn.getAccountGroupMember(req, message.objects[1])) {
          code = 400
          throw new Error('invalid mid')
        }
      }

      /*--------------------------------------------------*/
      
      // リダイレクト
      const url = `${cmn.S3_IMAGES_SERVER}/${message.mkey}/${fname}`
      res.redirect(url)
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, { code:code, error:{} }, err)
      res.status(code).send()
    }
  }

  doAsync(req, res)
})

// ファイル(メッセージ)
router.get('/:mid/:fname', (req, res, next) => {
  
  const doAsync = async (req, res) => {
    let code = 404
    try {
      const mid = ckUti.checkId(req.params.mid) ? req.params.mid : ''
      const fname = ckUti.checkStr(req.params.fname) ? req.params.fname : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!mid || !fname) {
        code = 400
        throw new Error('invalid get')
      }

      // キャッシュからメッセージ取得
      const message = await cache.getMessage(mid)
      if (!message) {
        throw new Error('not found mid')
      }
      if (message.type === cmn.DM_MTYPE) { // ダイレクトメッセージなら
        code = 400
        throw new Error('invalid mid')
      }
      
      // グループチェック(非公開になっている場合あり、その場合404)
      await _checkGroup(req, message.gid)
      
      // メッセージファイルチェック
      let name = fname
      const checkMessage = await Messages.findById(mid).select('files')
      const file = checkMessage.files.find(f => f.fname === fname)
      if (file) {
        const f = flUti.getPathExtend(file.fname)
        name = `${file.data.get('name')}${f.extend}`
      } else {
        throw new Error('not found file')
      }

      /*--------------------------------------------------*/

      const bucketParams = {
        Bucket: cmn.AWS_S3_FILES_BUCKET,
        Key: `${message.mkey}/${fname}`
      }

      // オブジェクト取得
      const data = await s3Client.send(new GetObjectCommand(bucketParams)) // 無ければエラー発生
      if (data) {
        res.set('Content-disposition', `attachment; filename="${encodeURI(name)}"`)
        res.status(200)
        data.Body.pipe(res)
      }
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, { code:code, error:{} }, err)
      res.status(code).send()
    }
  }

  doAsync(req, res)
})

// ファイル(コメント)
router.get('/:mid/:cid/:fname', (req, res, next) => {
  
  const doAsync = async (req, res) => {
    let code = 404
    try {
      const mid = ckUti.checkId(req.params.mid) ? req.params.mid : ''
      const cid = ckUti.checkId(req.params.cid) ? req.params.cid : ''
      const fname = ckUti.checkStr(req.params.fname) ? req.params.fname : ''

      /*--------------------------------------------------*/
      // チェック

      // 必須チェック
      if (!mid || !cid || !fname) {
        code = 400
        throw new Error('invalid get')
      }

      // キャッシュからメッセージ取得
      const message = await cache.getMessage(mid)
      if (!message) {
        throw new Error('not fount mid')
      }
      if (message.type === cmn.DM_MTYPE) { // ダイレクトメッセージなら 
        code = 400
        throw new Error('invalid mid')
      }

      // グループチェック(非公開になっている場合あり、その場合404)
      await _checkGroup(req, message.gid)
      
      // コメントファイルチェック
      let isExist = false
      let name = fname
      const checkComment = await Comments.findById(cid).select('mid files')
      if (checkComment && checkComment.mid === mid) {
        const file = checkComment.files.find(f => f.fname === fname)
        if (file) {
          const f = flUti.getPathExtend(file.fname)
          name = `${file.data.get('name')}${f.extend}`
          isExist = true
        }
      }
      if (!isExist) {
        throw new Error('not found file')
      }

      /*--------------------------------------------------*/

      const bucketParams = {
        Bucket: cmn.AWS_S3_FILES_BUCKET,
        Key: `${message.mkey}/${fname}`
      }

      // オブジェクト取得
      const data = await s3Client.send(new GetObjectCommand(bucketParams)) // 無ければエラー発生
      if (data) {
        res.set('Content-disposition', `attachment; filename="${encodeURI(name)}"`)
        res.status(200)
        data.Body.pipe(res)
      }
    } catch(err) {
      // エラーログ書き込み
      cmn.writeErrorlog(req, { code:code, error:{} }, err)
      res.status(code).send()
    }
  }

  doAsync(req, res)
})

//#endregion

/*--------------------------------------------------*/

module.exports = router

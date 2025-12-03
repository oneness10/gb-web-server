const cmn = require('../common')
const ckUti = require('../check-util')
const apUti = require('../api-util')
const flUti = require('../file-util')

const express = require('express')
const router = express.Router()

// ffmpeg
const ffmpeg = require('fluent-ffmpeg')

// 画像
const imageSize = require('image-size')
const sharp = require('sharp')

// ファイルアップロード
const multer = require('multer')
const fs = require('fs')
const tempStorage = multer.diskStorage({
  // 公開されない一時ディレクトリ
  destination: cmn.TEMP_DIR,
})
const objectIconUpload = multer({
  storage: tempStorage,
  limits: { fileSize:cmn.IMAGE_UPLOAD_MAX_SIZE }
})
const objectImageUpload = multer({
  storage: tempStorage,
  limits: { fileSize:cmn.IMAGE_UPLOAD_MAX_SIZE }
})
const imageUpload = multer({
  storage: tempStorage,
  limits: { fileSize:cmn.IMAGE_UPLOAD_MAX_SIZE }
})
const videoUpload = multer({
  storage: tempStorage,
  limits: { fileSize:cmn.VIDEO_UPLOAD_MAX_SIZE }
})
const fileUpload = multer({
  storage: tempStorage,
  limits: { fileSize:cmn.FILE_UPLOAD_MAX_SIZE }
})

const multerImageErrorHandler = (err, req, res, next) => {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // JSON送信
      apUti.sendJSON(res, {
        code: 200,
        error: { result:`ファイルが大きすぎます(最大${cmn.viewShortFilesize(cmn.IMAGE_UPLOAD_MAX_SIZE / 1000 / 1000)})` }
      })
    } else {
      res.status(500).json({ error:{ result:'エラーが発生しました' } })
    }
  } else {
    next()
  }
}

const multerVideoErrorHandler = (err, req, res, next) => {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // JSON送信
      apUti.sendJSON(res, {
        code: 200,
        error:  { result:`ファイルが大きすぎます(最大${cmn.viewShortFilesize(cmn.VIDEO_UPLOAD_MAX_SIZE / 1000 / 1000)})` }
      })
    } else {
      res.status(500).json({ error:{ result:'エラーが発生しました' } })
    }
  } else {
    next()
  }
}

const multerFileErrorHandler = (err, req, res, next) => {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // JSON送信
      apUti.sendJSON(res, {
        code: 200,
        error: { result:`ファイルが大きすぎます(最大${cmn.viewShortFilesize(cmn.FILE_UPLOAD_MAX_SIZE / 1000 / 1000)}MB)` }
      })
    } else {
      res.status(500).json({ error:{ result:'エラーが発生しました' } })
    }
  } else {
    next()
  }
}

/*--------------------------------------------------*/
//#region POST

// オブジェクトアイコンアップロード(公開バケットに保存)
router.post('/object/icon', [objectIconUpload.single('file'), multerImageErrorHandler], (req, res) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        console.log(`${req.originalUrl} ${req.method} {"path":${req.file.path}, "size":${req.file.size}, "mimetype":${req.file.mimetype}}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''

        const filePath = req.file.path

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        apUti.checkBelongGroup(req, json, gid)
        // 画像チェック
        apUti.checkImage(json, req.file)

        /*--------------------------------------------------*/
        // Sアイコンを作成

        const sFilePath = `${req.file.path}_s`
        
        await sharp(filePath)
          .resize(cmn.ICON_S_WIDTH, cmn.ICON_S_HEIGHT, { fit:'inside' } )
          .toFile(sFilePath)

        /*--------------------------------------------------*/
        
        const fid = cmn.generateReverseObjectId()
        const fname = `${fid}.png`
        const sFname = `${fid}_s.png`
        
        // アイコンS3オブジェクト送信
        await flUti.putS3Object(cmn.AWS_S3_PUBLIC_BUCKET, fname, filePath)
        // SアイコンS3オブジェクト送信
        await flUti.putS3Object(cmn.AWS_S3_PUBLIC_BUCKET, sFname, sFilePath)

        // tempにあるファイル削除
        flUti.deleteFile(filePath)
        flUti.deleteFile(sFilePath)

        json.image = fid

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

// オブジェクト画像アップロード(公開バケットに保存)
router.post('/object/image', [objectImageUpload.single('file'), multerImageErrorHandler], (req, res) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        console.log(`${req.originalUrl} ${req.method} {"path":${req.file.path}, "size":${req.file.size}, "mimetype":${req.file.mimetype}}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''

        let filePath = req.file.path

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        apUti.checkBelongGroup(req, json, gid)
        // 画像チェック
        apUti.checkImage(json, req.file)

        /*--------------------------------------------------*/

        // 品質を下げた画像を作成
        await sharp(filePath)
          .png({ quality:60 })
          .toFile(`${filePath}_`)
        // tempにあるファイル削除
        flUti.deleteFile(filePath)
        // ファイルパス変更
        filePath = `${filePath}_`

        /*--------------------------------------------------*/

        const fid = cmn.generateReverseObjectId()
        const fname = `${fid}.png`

        // オブジェクト画像S3オブジェクト送信
        await flUti.putS3Object(cmn.AWS_S3_PUBLIC_BUCKET, fname, filePath)
        // tempにあるファイル削除
        flUti.deleteFile(filePath)

        json.image = fid

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

// 画像アップロード(一時バケットに保存)
router.post("/image", [imageUpload.single('file'), multerImageErrorHandler], (req, res) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        console.log(`${req.originalUrl} ${req.method} {"path":${req.file.path}, "size":${req.file.size}, "mimetype":${req.file.mimetype}}`)

        const filePath = req.file.path

        /*--------------------------------------------------*/
        // チェック

        // 画像チェック
        if (!flUti.checkImage(req.file)) {
          json.errors.result = '無効な画像ファイルです'
          throw new Error('invalid image file')
        }

        /*--------------------------------------------------*/
        // S画像を作成

        const sFilePath = `${filePath}_s`
        
        // 画像サイズ取得(画像でなければエラー)
        const size = await imageSize(filePath)
        if (size.width < cmn.IMAGE_S_MAX_SIZE && size.height < cmn.IMAGE_S_MAX_SIZE) {
          fs.copyFileSync(filePath, sFilePath)
        } else {
          await sharp(filePath)
            .resize(cmn.IMAGE_S_MAX_SIZE, cmn.IMAGE_S_MAX_SIZE, { fit:'outside' } )
            .toFile(sFilePath)
        }

        /*--------------------------------------------------*/

        // パス、拡張子取得
        const f = flUti.getPathExtend(decodeURIComponent(req.file.originalname))
        const extend = f.extend.toLowerCase()
        
        const fid = cmn.generateObjectId()
        const fname = `${fid}${extend}`
        const sFname = `${fid}_s${extend}`

        // 画像S3オブジェクト送信
        await flUti.putS3Object(cmn.AWS_S3_TEMP_BUCKET, fname, filePath)
        // S画像をアップロード
        await flUti.putS3Object(cmn.AWS_S3_TEMP_BUCKET, sFname, sFilePath)

        // tempにあるファイル削除
        flUti.deleteFile(filePath)
        flUti.deleteFile(sFilePath)

        json.image = { fname:fname, type:cmn.IMAGE_FTYPE, size:0, data:{ w:size.width, h:size.height } }
            
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

// 動画アップロード(一時バケットに保存)
router.post("/video", [videoUpload.single('file'), multerVideoErrorHandler], (req, res) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        console.log(`${req.originalUrl} ${req.method} {"path":${req.file.path}, "size":${req.file.size}, "mimetype":${req.file.mimetype}}`)

        let filePath = req.file.path

        /*--------------------------------------------------*/
        // チェック

        // 動画チェック
        if (!flUti.checkVideo(req.file)) {
          json.errors.result = '無効な動画ファイルです'
          throw new Error('invalid video file')
        }

        /*--------------------------------------------------*/
        // ffprobeで情報取得

        let dur = 0
        
        // ffprobe
        const getInfo = async () => {
          return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, data) => {
              if (!err) {
                resolve(data)
              } else {
                reject(err)
              }
            })
          })
        }

        try {
          // ffprobe
          const data = await getInfo()
          // console.log(`ffprobe=`) 
          // console.dir(data) // ファイルチェック
          // 時間セット
          dur = Math.floor(data.format.duration)
        } catch {
          json.errors.result = '無効な動画ファイルです'
          throw new Error('invalid video file')
        }

        /*--------------------------------------------------*/
        // movならmp4に変換

        if (req.file.mimetype === 'video/quicktime') { // movなら

          // MOVをMP4に変換
          const convertMp4 = async () => {
            return new Promise((resolve, reject) => {
              ffmpeg(filePath)
                .outputOptions('-c copy')
                .output(filePath + '.mp4')
                .on('end', () => {
                  resolve(true)
                })
                .on('error', (err) => {
                  reject(err)
                })
                .run()
            })
          }

          try {
            // MOVをMP4に変換
            await convertMp4()
            // tempにあるファイル削除
            flUti.deleteFile(filePath)
            // ファイルパス変更
            filePath = filePath + '.mp4'
          } catch {
            json.errors.result = '無効な動画ファイルです'
            throw new Error('invalid video file')
          }
        }

        /*--------------------------------------------------*/
        // サムネイル作成

        const f = flUti.splitPath(req.file.path)

        const _tmbFilename = f.name + '_.png'
        const _tmbFilePath = cmn.TEMP_DIR + '/' + _tmbFilename
        const tmbFilePath = cmn.TEMP_DIR + '/' + f.name + '.png'
        const sTmbFilePath = cmn.TEMP_DIR + '/' + f.name + '_s.png'

        // サムネイル作成
        const createThumbnail = async () => {
          return new Promise((resolve, reject) => {
            ffmpeg(filePath)
              .screenshots({
                timestamps: [0],
                filename: _tmbFilename,
                folder: cmn.TEMP_DIR,
              })
              .on('end', () => {
                resolve(true)
              })
              .on('error', (err) => {
                reject(err)
              })
          })
        }

        try {
          // サムネイル作成
          await createThumbnail()
        } catch {
          json.errors.result = '無効な動画ファイルです'
          throw new Error('invalid video file')
        }

        // 品質を下げたサムネイルを作成
        await sharp(_tmbFilePath)
          .png({ quality:60 })
          .toFile(tmbFilePath)
        // tempにあるファイル削除
        flUti.deleteFile(_tmbFilePath)

        // Sサムネイルを作成
        // 画像サイズ取得(画像でなければエラー)
        const size = await imageSize(tmbFilePath)
        if (size.width < cmn.IMAGE_S_MAX_SIZE && size.height < cmn.IMAGE_S_MAX_SIZE) {
          fs.copyFileSync(tmbFilePath, sTmbFilePath)
        } else {
          await sharp(tmbFilePath)
            .resize(cmn.IMAGE_S_MAX_SIZE, cmn.IMAGE_S_MAX_SIZE, { fit:'outside' } )
            .toFile(sTmbFilePath)
        }

        /*--------------------------------------------------*/

        const fid = cmn.generateObjectId()
        const fname = `${fid}.mp4`
        const tmbFname = `${fid}.png`
        const sTmbFname = `${fid}_s.png`

        // 動画S3オブジェクト送信
        await flUti.putS3Object(cmn.AWS_S3_TEMP_BUCKET, fname, filePath)
        // サムネイルS3オブジェクト送信
        await flUti.putS3Object(cmn.AWS_S3_TEMP_BUCKET, tmbFname, tmbFilePath)
        // Sサムネイルをアップロード
        await flUti.putS3Object(cmn.AWS_S3_TEMP_BUCKET, sTmbFname, sTmbFilePath)

        // tempにあるファイル削除
        flUti.deleteFile(filePath)
        // tempにあるファイル削除
        flUti.deleteFile(tmbFilePath)
        // tempにあるファイル削除
        flUti.deleteFile(sTmbFilePath)

        json.image = { fname:fname, type:cmn.VIDEO_FTYPE, size:0, data:{ dur:dur, w:size.width, h:size.height } }
        
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

// ファイルアップロード(一時バケットに保存)
router.post('/file', [fileUpload.single('file'), multerFileErrorHandler], (req, res) => {
  // ログインチェック
  if (apUti.checkLogin(req, res)) {

    const doAsync = async (req, res) => {
      const json = { code:200, errors:{} }
      try {
        console.log(`${req.originalUrl} ${req.method} {"path":${req.file.path}, "size":${req.file.size}, "mimetype":${req.file.mimetype}}`)

        const gid = ckUti.checkId(req.body.gid) ? req.body.gid : ''

        const filePath = req.file.path

        /*--------------------------------------------------*/
        // チェック

        // 必須チェック
        if (!gid) {
          json.code = 400
          throw new Error('invalid post')
        }

        // 所属グループチェック
        apUti.checkBelongGroup(req, json, gid)
        // グループファイルサイズチェック
        await apUti.checkGroupFilesize(json, gid, req.file.size)
        
        /*--------------------------------------------------*/

        // パス、拡張子取得
        const f = flUti.getPathExtend(decodeURIComponent(req.file.originalname))
        const extend = f.extend.toLowerCase()
        
        const fid = cmn.generateObjectId()
        const fname = `${fid}${extend}`

        // アイコンS3オブジェクト送信
        await flUti.putS3Object(cmn.AWS_S3_TEMP_BUCKET, fname, filePath)
        // tempにあるファイル削除
        flUti.deleteFile(filePath)

        json.file = { fname:fname, name:decodeURIComponent(f.name) }
        
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

module.exports = router

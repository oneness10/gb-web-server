const cmn = require('./common')
const ckUti = require('./check-util')
const apUti = require('./api-util')
const flUti = require('./file-util')
const dtUti = require('./datetime-util')

// MongoDB
const mongoose = require('mongoose')

// スキーマ
const Groups = require('./schema/groups')
const Objects = require('./schema/objects')
const Messages = require('./schema/messages')
const Comments = require('./schema/comments')
const Schedules = require('./schema/schedules')

// 正規表現
const regexp_url = /(https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+)/g

// 文字数
const runes = require('runes')

/*--------------------------------------------------*/

// メッセージ情報クリア
const clearMessageInfo = (message) => {
  // _id
  // gid
  // mid
  // mkey
  // type
  // status
  message.pub = false
  // wgid
  // wmoid
  // rgid
  // rmid
  // rwgid
  // rwmoid
  // pmode
  message.members = []
  message.objects = []
  message.sid = ''
  message.soid = ''
  message.sdata = {}
  message.title = ''
  message.text = ''
  message.blocks = []
  message.images = []
  message.files = []
  message.okcount = 0
  message.okmembers = []
  message.ccount = 0
  message.allccount = 0
  message.rpcount = 0
  message.ctime = 0
  message.etime = 0
  //htime
  message.utime = 0
}

// resメッセージセット
const setResMessage = async (req, messages, sgid, _group) => {
  
  const gidSet = new Set()
  const oidSet = new Set()
  const inSidSet = new Set()
  const okMidSet = new Set()
  for (let message of messages) {

    let _message = message
    if ('_doc' in message) _message = message._doc

    // 参照状態セットされていなかったら状態無しをセット
    if ('rst' in _message === false) _message.rst = cmn.NONE_RSTATUS

    if (_message.type === cmn.DM_MTYPE) {
      // ダイレクトメッセージ
      if (_group && _message.objects.length === 2) {
        if (_message.objects[0] !== _group.moid) oidSet.add(_message.objects[0])
        if (_message.objects[1] !== _group.moid) oidSet.add(_message.objects[1])
      }
    } else {

      // グループ
      if (_message.rgid && _message.rgid !== sgid) {
        gidSet.add(_message.rgid)
      }
      // 書き込みメンバー
      const wgid = (!_message.rwgid) ? _message.wgid : _message.rwgid
      const wmoid = (!_message.rwmoid) ? _message.wmoid : _message.rwmoid
      if (wgid && wmoid && wgid !== sgid) {
        oidSet.add(wmoid)
      }

      // 参照できないメッセージはコンテニュー
      if (_message.rst !== cmn.NONE_RSTATUS && _message.rst !== cmn.NORMAL_RSTATUS) continue

      // スケジュールオブジェクト
      if (_message.soid) {
        oidSet.add(_message.soid)
      }
      // OKメンバー
      if (_message.okmembers.length > 0 && _message.pub === true) { // 公開メッセージ
        _message.okmembers.map(oid => oidSet.add(oid))
      }
      // スケジュールオブジェクト
      if (_group && _message.sid) {
        inSidSet.add(_message.sid)
      }
      // OKしているか
      if (_group) {
        if (_message.rmid) {
          okMidSet.add(_message.rmid)
        } else {
          okMidSet.add(_message.mid)
        }
      }
    }
  }
  
  // 一意の配列に変換
  const oidArray = Array.from(oidSet)
  const inSidArray = Array.from(inSidSet)
  const okMidArray = Array.from(okMidSet)

  let checkObjects = []
  if (oidArray.length > 0) {
    checkObjects = await Objects.find({ gid:{ $ne:sgid }, oid:{ $in:oidArray } }).select('gid oid status type icon name')
  }

  let checkInSchedules = []
  if (_group && inSidArray.length > 0) {
    checkInSchedules = await Schedules.find({ rsid:{ $in:inSidArray }, gid:_group.gid, oid:_group.moid, type:cmn.INSCHEDULE_STYPE }).select('rsid')
  }

  let checkOkComments = []
  if (_group && okMidArray.length > 0) {
    checkOkComments = await Comments.find({ mid:{ $in:okMidArray }, wgid:_group.gid, wmoid:_group.moid, type:cmn.OK_CTYPE }).select('mid type')
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
  
  for (let message of messages) {

    let _message = message
    if ('_doc' in message) _message = message._doc

    // 参照メッセージ
    if (_message.type === cmn.REPOST_MTYPE || _message.type === cmn.REF_MTYPE) {
      // 参照グループ妥当性チェック
      if (_message.rgid !== sgid) {
        const _group = cmn.getAccountGroup(req, _message.rgid)
        if (!_group) {
          const group = checkGroups.find(g => g.gid === _message.rgid)
          if (group) {
            if (group.status === cmn.STOP_GSTATUS) {
              _message.rst = cmn.GSTOP_RSTATUS // 参照状態グループ停止
              // メッセージ情報クリア
              clearMessageInfo(_message)
            } else {
              if (!group.pub) { // 公開中
                _message.rst = cmn.NOTVIEW_RSTATUS // 参照状態非表示
                // メッセージ情報クリア
                clearMessageInfo(_message)
              }
            }
          } else {
            _message.rst = cmn.GDELETE_RSTATUS // 参照状態グループ削除
            // メッセージ情報クリア
            clearMessageInfo(_message)
          }
        }
      }
    }

    if (_message.type === cmn.DM_MTYPE) {
      // ダイレクトメッセージ
      if (_group && _message.objects.length === 2) {
        let oid = ''
        if (_message.objects[0] !== _group.moid) oid = _message.objects[0]
        if (_message.objects[1] !== _group.moid) oid = _message.objects[1]
        const obj = checkObjects.find(o => o.oid === oid)
        _message.dmobj = (obj) ? obj._doc : null
        if (obj && obj.status === cmn.DELETE_OSTATUS) { // 状態が削除なら
          const accountGroup = cmn.getAccountGroup(req, obj.gid)
          if (!accountGroup) { // 所属では無いなら
            _message.dmobj = null
          }
        }
      }
    } else {
      // 書き込みメンバー
      const wgid = (!_message.rwgid) ? _message.wgid : _message.rwgid
      const wmoid = (!_message.rwmoid) ? _message.wmoid : _message.rwmoid
      if (wgid && wmoid && wgid !== sgid) {
        const obj = checkObjects.find(o => o.oid === wmoid)
        _message.wmobj = (obj) ? obj._doc : null
        if (obj && obj.status === cmn.DELETE_OSTATUS) { // 状態が削除なら
          const accountGroup = cmn.getAccountGroup(req, obj.gid)
          if (!accountGroup) { // 所属では無いなら
            _message.wmobj = null
          }
        }
      }

      // 参照できないメッセージはコンテニュー
      if (_message.rst !== cmn.NONE_RSTATUS && _message.rst !== cmn.NORMAL_RSTATUS) continue

      // スケジュールオブジェクト
      if (_message.soid) {
        const obj = checkObjects.find(o => o.oid === _message.soid)
        _message.sobj = (obj) ? obj._doc : null
      }
      // OKメンバー
      if (_message.okmembers.length > 0 && _message.pub === true) { // 公開メッセージ
        _message.okobj = []
        for (let oid of _message.okmembers) {
          const obj = checkObjects.find(o => o.oid === oid)
          if (obj) _message.okobj.push(obj._doc)
        }
      }
      // 取り込みスケジュール
      if (_group && _message.sid) {
        const sch = checkInSchedules.find(s => s.rsid === _message.sid)
        _message.isinsch = (sch) ? true : false
      }
      // OKしているか
      if (_group) {
        if (_message.rmid) {
          const okComment = checkOkComments.find(c => c.mid === _message.rmid)
          _message.okself = (okComment) ? true : false
        } else {
          const okComment = checkOkComments.find(c => c.mid === _message.mid)
          _message.okself = (okComment) ? true : false
        }
      }
    }

    // 不必要なフィールド削除
    if ('_id' in _message) delete _message._id
    if ('stext' in _message) delete _message.stext
    if ('members' in _message) delete _message.members
    if ('rmsg' in _message) delete _message.rmsg

    // mkey メッセージが非公開でログインしていてOSがセットされていないかOSがWebの時は削除
    if ('mkey' in _message) {
      if (!_message.pub && (!req.session.os || req.session.os === cmn.WEB_OS)) { 
        delete _message.mkey
      }
    }
  }
}

//#endregion

/*--------------------------------------------------*/
//#region POST

// 文字数取得
const getStrCount = (content) => {
  
  let count = 0
  for (let block of content.blocks) {
    const textAry = runes(block.text)
    count += textAry.length
  }

  return count
}

// 検索テスト取得
const getStext = (title, schTitle) => {

  let stext = title
  if (schTitle) {
    stext = `${title}${(title) ? ' ' : ''}${schTitle}`
  }

  return stext
}

// テキストブロックセット
const setTextBlocks = (content) => {

  let text = ''
  const blocks = []
  const objects = []

  let offset = 0

  for (let contentBlock of content.blocks) {
    
    let blockTextAry = []
    const block = { offset:0, len:0, entities:[] }

    const textAry = [...contentBlock.text] // 絵文字対応するため文字配列にする
    
    if (contentBlock.entityRanges.length > 0) {
      let blockOffset = 0
      for (let entity of contentBlock.entityRanges) {
        const entityMap = content.entityMap[entity.key]
        
        const type = Number(entityMap.type)
        if (!ckUti.checkTextObjectType(type)) type = 0

        let data = {}
        if (type === cmn.FILE_OTYPE) {
          // ファイル
          data = { fname:entityMap.data.fname, name:entityMap.data.name }
        } else {
          // オブジェクト
          const oid = entityMap.data.oid
          data = { oid:oid, icon:entityMap.data.icon, name:entityMap.data.name, }
          if ('gid' in entityMap.data) {
            data.gid = entityMap.data.gid
          }
          if (objects.indexOf(oid) === -1) {
            // 関連オブジェクトにid追加
            objects.push(oid)
          }
        }

        // コンテンツ

        // エンティティ前のテキスト
        blockTextAry.splice(blockTextAry.length, 0, ...textAry.slice(blockOffset, entity.offset))
        
        // エンティティ追加
        block.entities.push({
          type: type,
          offset: blockTextAry.length,
          len: entity.length,
          data: data,
        })

        blockOffset = entity.offset

        // エンティティテキスト
        blockTextAry.splice(blockTextAry.length, 0, ...textAry.slice(blockOffset, blockOffset + entity.length))
        blockOffset += (entity.length) // + エンティティ
      }
      blockTextAry.splice(blockTextAry.length, 0, ...textAry.slice(blockOffset))
    } else {
      blockTextAry.splice(0, 0, ...textAry.slice(0))
    }

    // リンク
    let matchAry
    let ii = 0
    while ((matchAry = regexp_url.exec(contentBlock.text)) !== null) {
      const urlAry = [...matchAry[0]] // 絵文字対応するため文字配列にする
      let start = 0
      let i = 0
      let j = 0
      for (i = ii; i < blockTextAry.length; i++) {
        if (blockTextAry[i] === urlAry[j]) {
          if (j === 0) start = i
          ++j
          if (j >= urlAry.length) break
        } else {
          start = 0
          j = 0
        }
      }
      ii = ++i

      block.entities.push({
        type: cmn.LINK_OTYPE,
        offset: start,
        len: urlAry.length,
        data: {},
      })
    }

    // offset順に並び替え
    block.entities.sort((a, b) => {
      if (a.offset < b.offset) return -1
      if (a.offset > b.offset) return 1
      return 0
    })

    text += blockTextAry.slice(0).join('')

    block.offset = offset
    block.len = blockTextAry.length

    offset += blockTextAry.length

    // ブロック追加
    blocks.push(block)
  }

  return { 
    text: text,
    blocks: blocks,
    objects: objects,
  }
}

// 新規ファイル一覧を取得
const getNewFiles = (beforFiles, files) => {

  const newFiles = []

  for (let image of files) {
    let isExist = false
    for (let beforImage of beforFiles) {
      if (beforImage.fname === image.fname) {
        isExist = true
        break
      }
    }
    if (isExist === false) { // 新規
      newFiles.push(image)
    }
  }

  return newFiles
}

// 画像チェック
const checkImages = (json, beforImages, images) => {
  
  for (let image of images) {
    let isExist = false
    for (let beforImage of beforImages) {
      if (beforImage.fname === image.fname) {
        isExist = true
        break
      }
    }
    if (isExist === false) { // 新規
      // ファイル名チェク
      apUti.checkFilename(json, image.fname, 'image fname')
      
      // 画像タイプチェック
      let checkType = false
      if (ckUti.checkNumber(image.type)) {
        if (image.type === cmn.IMAGE_FTYPE || image.type === cmn.VIDEO_FTYPE) {
          checkType = true
        }
      }
      if (!checkType) {
        json.code = 400
        throw new Error('invalid image type')
      }

      // 幅チェック
      if (!ckUti.checkNumber(image.data.w)) {
        json.code = 400
        throw new Error('invalid image w')
      }
      // 幅チェック
      if (!ckUti.checkNumber(image.data.h)) {
        json.code = 400
        throw new Error('invalid image h')
      }
      if (image.type === cmn.IMAGE_FTYPE) { // 画像
        image.data = { w:image.data.w, h:image.data.h }
      }
      if (image.type === cmn.VIDEO_FTYPE) { // 動画
        // 時間チェック
        if (!ckUti.checkNumber(image.data.dur)) {
          json.code = 400
          throw new Error('invalid image dur')
        }
        image.data = { dur:image.data.dur, w:image.data.w, h:image.data.h } // 余分なデータが入っていた時の為
      }
    }
  }
}

// 画像セット
const setImages = async (mkey, beforImages, images) => {
  
  for (let i = 0; i < images.length; i++) {

    const image = images[i]
  
    let isExist = false
    for (let beforImage of beforImages) {
      if (beforImage.fname === image.fname) {
        isExist = true
        break
      }
    }
    if (isExist === false) { // 新規

      // パス、拡張子取得
      const f = flUti.getPathExtend(image.fname)
      const fid = cmn.generateOneId8()
      const fname = `${fid}${f.extend}`

      let size = 0

      if (image.type === cmn.IMAGE_FTYPE) {
        // 画像

        // 画像S3コピー
        size += await flUti.copyS3Object(cmn.AWS_S3_IMAGES_BUCKET, `${mkey}/${fid}${f.extend}`, cmn.AWS_S3_TEMP_BUCKET, `${f.name}${f.extend}`)
        // S画像S3コピー
        size += await flUti.copyS3Object(cmn.AWS_S3_IMAGES_BUCKET, `${mkey}/${fid}_s${f.extend}`, cmn.AWS_S3_TEMP_BUCKET, `${f.name}_s${f.extend}`)
      }
      if (image.type === cmn.VIDEO_FTYPE) {
        // 動画

        // 動画S3コピー
        size += await flUti.copyS3Object(cmn.AWS_S3_IMAGES_BUCKET, `${mkey}/${fid}${f.extend}`, cmn.AWS_S3_TEMP_BUCKET, `${f.name}${f.extend}`)
        // サムネイルS3コピー
        size += await flUti.copyS3Object(cmn.AWS_S3_IMAGES_BUCKET, `${mkey}/${fid}.png`, cmn.AWS_S3_TEMP_BUCKET, `${f.name}.png`)
        // SサムネイルS3コピー
        size += await flUti.copyS3Object(cmn.AWS_S3_IMAGES_BUCKET, `${mkey}/${fid}_s.png`, cmn.AWS_S3_TEMP_BUCKET, `${f.name}_s.png`)
      }

      images[i] = {
        fname: fname,
        type: image.type,
        size: size,
        data: image.data,
      }
    }
  }
}

// 画像削除
const deleteImages = async (bucket, dir, deleteImages, checkImages) => {
  
  for (let deleteImage of deleteImages) {
    let isExist = false
    for (let checkImage of checkImages) {
      if (checkImage.fname === deleteImage.fname) {
        isExist = true
        break
      }
    }
    if (isExist === false) { // チェック画像に存在しない
      // パス、拡張子取得
      const f = flUti.getPathExtend(deleteImage.fname)

      if (deleteImage.type === cmn.IMAGE_FTYPE) {
        // 画像
        const key = `${(dir) ? `${dir}/` : ''}${f.name}${f.extend}`
        const sKey = `${(dir) ? `${dir}/` : ''}${f.name}_s${f.extend}`
        
        // ファイル削除
        flUti.deleteS3Object(bucket, key)
        flUti.deleteS3Object(bucket, sKey)
      }
      if (deleteImage.type === cmn.VIDEO_FTYPE) {
        // 動画
        const key = `${(dir) ? `${dir}/` : ''}${f.name}${f.extend}`
        const tmbKey = `${(dir) ? `${dir}/` : ''}${f.name}.png`
        const sTmbKey = `${(dir) ? `${dir}/` : ''}${f.name}_s.png`
        
        // ファイル削除
        flUti.deleteS3Object(bucket, key)
        flUti.deleteS3Object(bucket, tmbKey)
        flUti.deleteS3Object(bucket, sTmbKey)
      }
    }
  }
}

// ファイルチェック
const checkFiles = (json, beforFiles, files) => {
  
  for (let file of files) {
    let isExist = false
    for (let beforFile of beforFiles) {
      if (beforFile.fname === file.fname) {
        isExist = true
        break
      }
    }
    if (isExist === false) { // 新規
      // ファイル名チェク
      apUti.checkFilename(json, file.fname, 'file fname')

      // 画像タイプチェック
      let checkType = false
      if (ckUti.checkNumber(file.type)) {
        if (file.type === cmn.FILE_FTYPE) {
          checkType = true
        }
      }
      if (!checkType) {
        json.code = 400
        throw new Error('invalid file type')
      }

      // 名前チェック
      if (!ckUti.checkStr(file.data.name)) {
        json.code = 400
        throw new Error('invalid file name')
      }
    }
  }
}

// ファイルセット
const setFiles = async (mkey, beforFiles, files, blocks) => {
  
  for (let i = 0; i < files.length; i++) {
  
    const file = files[i]

    let isExist = false
    for (let beforFile of beforFiles) {
      if (beforFile.fname === file.fname) {
        isExist = true
        break
      }
    }
    if (isExist === false) {
      
      // パス、拡張子取得
      const f = flUti.getPathExtend(file.fname)
      
      const fid = cmn.generateOneId8()
      let fname = `${fid}${f.extend}`

      // ファイルS3コピー
      const size = await flUti.copyS3Object(cmn.AWS_S3_FILES_BUCKET, `${mkey}/${fname}`, cmn.AWS_S3_TEMP_BUCKET, file.fname)
      
      // コンテンツのエンティティ書き換え
      let isExist = false
      for (let block of blocks) {
        for (let entity of block.entities) {
          if (entity.type === cmn.FILE_OTYPE) {
            if (entity.data.fname === file.fname) {
              entity.data.fname = fname
              isExist = true
              break
            }
          }
        }
        if (isExist) break
      }
      
      files[i] = {
        fname: fname,
        type: file.type,
        size: size,
        data: file.data,
      }
    }
  }
}

// ファイル削除
const deleteFiles = async (bucket, dir, deleteFiles, checkFiles) => {
  
  for (let deleteFile of deleteFiles) {
    let isExist = false
    for (let checkFile of checkFiles) {
      if (checkFile.fname === deleteFile.fname) {
        isExist = true
        break
      }
    }
    if (isExist === false) { // チェックファイルに存在しない
      // パス、拡張子取得
      const f = flUti.getPathExtend(deleteFile.fname)
      const key = `${(dir) ? `${dir}/` : ''}${f.name}${f.extend}`
      // ファイル削除
      flUti.deleteS3Object(bucket, key)
    }
  }
}

// 参照メッセージセット
const setRefMessage = async (_group, status, message, session) => {
  
  // 現在の時間
  const ntime = dtUti.getNowUtime()

  // 参照メッセージ取得
  find = {
    wgid: _group.gid,
    wmoid: _group.moid,
    rmid: message.mid,
    type: cmn.REF_MTYPE,
  }
  const setMessage = await Messages.findOne(find).session(session)
  if (!setMessage) {

    // ObjectId手動生成
    const _mid = new mongoose.Types.ObjectId
    const mid = String(_mid)

    // 参照メッセージ作成
    const newMessage = await Messages.create(
      [{
        _id: _mid,
        gid: _group.gid,
        mid: mid,
        type: cmn.REF_MTYPE,
        status: status,
        pub: false,
        wgid: _group.gid,
        wmoid: _group.moid,
        rgid: message.gid,
        rmid: message.mid,
        rwgid: message.wgid,
        rwmoid: message.wmoid,
        pmode: cmn.NONE_PMODE,
        ctime: ntime,
        etime: ntime,
        htime: ntime,
        utime: ntime,
      }],
      { session:session })
    if (!newMessage) {
      throw new Error('failed create message')
    }
  } else {
    setMessage.status = status
    setMessage.htime = ntime // ホーム時間を上げる
    setMessage.utime = ntime
    // メッセージ更新
    const updateMessage = await setMessage.save({ session:session })
    if (!updateMessage) {
      throw new Error('failed update message')
    }
  }
  return true
}

//#endregion

/*--------------------------------------------------*/

exports.clearMessageInfo = clearMessageInfo
exports.setResMessage = setResMessage
exports.getStrCount = getStrCount
exports.getStext = getStext
exports.setTextBlocks = setTextBlocks
exports.getNewFiles = getNewFiles
exports.checkImages = checkImages
exports.setImages = setImages
exports.deleteImages = deleteImages
exports.checkFiles = checkFiles
exports.setFiles = setFiles
exports.deleteFiles = deleteFiles
exports.setRefMessage = setRefMessage
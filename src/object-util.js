const cmn = require('./common')
const cache = require('./cache')

// スキーマ
const Members = require('./schema/members')

/*--------------------------------------------------*/

// resオブジェクトセット
const setResObject = async (objects) => {

  for (let object of objects) {
    let _object = object
    if ('_doc' in object) _object = object._doc

    // グループオブジェクト
    if (!_object.pgid && (_object.type === cmn.MGROUP_OTYPE || _object.type === cmn.GGROUP_OTYPE || _object.type === cmn.HGROUP_OTYPE)) {
      // キャッシュからグループ取得
      const cacheGroup = await cache.getGroup(_object.gid)
      _object.pgid = cacheGroup.pgid // グループオブジェクトにpgid追加(列を追加するには_docに追加)
    }
    // メンバーオブジェクト
    if (!_object.pmid && _object.type === cmn.MEMBER_OTYPE) {
      // メンバー取得
      const checkMember = await Members.findOne({ moid:_object.oid }).select('pmid')
      _object.pmid = checkMember.pmid // メンバーオブジェクトにpmid追加(列を追加するには_docに追加)
    }
    
    // 不必要なフィールド削除
    if ('_id' in _object) delete _object._id
    if ('gid' in _object) delete _object.gid
    if ('messages' in _object) delete _object.messages
    if ('ctime' in _object) delete _object.ctime
  }
}

/*--------------------------------------------------*/

exports.setResObject = setResObject
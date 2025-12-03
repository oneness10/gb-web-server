const cache = require('./cache') 
const dtUti = require('./datetime-util')


// MongoDB
const mongoose = require('mongoose')

// スキーマ
const Accounts = require('./schema/accounts')
const Groups = require('./schema/groups') 
const Deletegroups = require('./schema/deletegroups') 
const Members = require('./schema/members')
const Addmembers = require('./schema/addmembers')
const Objects = require('./schema/objects')
const Messages = require('./schema/messages')
const Comments = require('./schema/comments')
const Schedules = require('./schema/schedules')

const _Accounts = require('./schema/_accounts')
const _Groups = require('./schema/_groups') 
const _Members = require('./schema/_members')
const _Addmembers = require('./schema/_addmembers')
const _Objects = require('./schema/_objects')
const _Messages = require('./schema/_messages')
const _Comments = require('./schema/_comments')
const _Schedules = require('./schema/_schedules')

/*--------------------------------------------------*/

// アカウント削除
const deleteAccount = async (account, session) => {
  
  // 削除アカウント作成
  const _newAccount = await _Accounts.create(
    [{
      _id: new mongoose.Types.ObjectId,
      aid: account.aid,
      mail: account.mail,
      password: account.password,
      name: account.name,
      birthday: account.birthday,
      settings: account.settings,
      dgid: account.dgid,
      amode: account.amode,
      groups: account.groups,
      ctime: account.ctime,
      utime: dtUti.getNowUtime(),
      logs: account.logs,
    }],
    { session:session }
  )
  if (!_newAccount) {
    throw new Error('failed create delete account')
  }

  // アカウント削除
  const deleteAccount = await Accounts.findByIdAndDelete(account._id).session(session)
  if (!deleteAccount) {
    throw new Error('failed delete account')
  }

  return deleteAccount
}

// グループ削除
const deleteGroup = async (group, session) => {
  
  const gid = group.gid

  // 削除グループ作成
  const _newGroup = await _Groups.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: group.gid,
      goid: group.goid,
      ooid: group.ooid,
      pgid: group.pgid,
      mode: group.mode,
      status: group.status,
      pub: group.pub,
      name: group.name,
      settings: group.settings,
      ctime: group.ctime,
      utime: dtUti.getNowUtime(),
    }],
    { session:session }
  )
  if (!_newGroup) {
    throw new Error('failed create delete group')
  }

  // 削除グループ作成
  const newDeletegroup = await Deletegroups.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: group.gid,
      ctime: dtUti.getNowUtime(),
    }],
    { session:session }
  )
  if (!newDeletegroup) {
    throw new Error('failed create delete group')
  }

  // グループ削除
  const deleteGroup = await Groups.findByIdAndDelete(group._id).session(session)
  if (!deleteGroup) {
    throw new Error('failed delete group')
  }

  // キャッシュのグループ削除
  await cache.deleteData(`gp:${gid}`)

  return deleteGroup
}

// メンバー削除
const deleteMember = async (member, session) => {
  
  // 削除メンバー作成
  const _newMember = await _Members.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: member.gid,
      mid: member.mid,
      moid: member.moid,
      pmid: member.pmid,
      dmmode: member.dmmode,
      settings: member.settings,
      scount: member.scount,
      chtime: member.chtime,
      ctime: member.ctime,
      utime: dtUti.getNowUtime(),
    }],
    { session:session }
  )
  if (!_newMember) {
    throw new Error('failed create delete member')
  }

  // メンバー削除
  const deleteMember = await Members.findByIdAndDelete(member._id).session(session)
  if (!deleteMember) {
    throw new Error('failed delete member')
  }

  return deleteMember
}

// メンバー追加削除
const deleteAddmember = async (addmember, session) => {
  
  // 削除メンバー追加作成
  const _newAddmember = await _Addmembers.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: addmember.gid,
      amid: addmember.amid,
      status: addmember.status,
      sendid: addmember.sendid,
      message: addmember.message,
      moid: addmember.moid,
      name: addmember.name,
      ctime: addmember.ctime,
      utime: dtUti.getNowUtime(),
    }],
    { session:session }
  )
  if (!_newAddmember) {
    throw new Error('failed create delete add member')
  }

  // メンバー追加削除
  const deleteAddmember = await Addmembers.findByIdAndDelete(addmember._id).session(session)
  if (!deleteAddmember) {
    throw new Error('failed delete add member')
  }

  return deleteAddmember
}

// オブジェクト削除
const deleteObject = async (object, session) => {
  
  // 削除オブジェクト作成
  const _newObject = await _Objects.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: object.gid,
      oid: object.oid,
      status: object.status,
      nstatus: object.nstatus,
      ntext: object.ntext,
      type: object.type,
      image: object.image,
      icon: object.icon,
      name: object.name,
      data: object.data,
      scount: object.scount,
      members: object.members,
      items: object.items,
      messages: object.messages,
      ctime: object.ctime,
      utime: dtUti.getNowUtime(),
    }],
    { session:session }
  )
  if (!_newObject) {
    throw new Error('failed create delete object')
  }

  // オブジェクト削除
  const deleteObject = await Objects.findByIdAndDelete(object._id).session(session)
  if (!deleteObject) {
    throw new Error('failed delete object')
  }

  return deleteObject
}

// メッセージ削除
const deleteMessage = async (message, session) => {
  
  const mid = message.mid

  // 削除メッセージ作成
  const _newMessage = await _Messages.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: message.gid,
      mid: message.mid,
      mkey: message.mkey,
      type: message.type,
      status: message.status,
      pub: message.pub,
      wgid: message.wgid,
      wmoid: message.wmoid,
      rgid: message.rgid,
      rmid: message.rmid,
      rwgid: message.rwgid,
      rwmoid: message.rwmoid,
      stext: message.stext,
      pmode: message.pmode,
      members: message.members,
      objects: message.objects,
      sid: message.sid,
      soid: message.soid,
      sdata: message.sdata,
      title: message.title,
      text: message.text,
      blocks: message.blocks,
      images: message.images,
      files: message.files,
      settings: message.settings,
      okcount: message.okcount,
      okmembers: message.okmembers,
      ccount: message.ccount,
      allccount: message.allccount,
      rpcount: message.rpcount,
      ctime: message.ctime,
      etime: message.etime,
      htime: message.htime,
      utime: dtUti.getNowUtime(),
    }],
    { session:session }
  )
  if (!_newMessage) {
    throw new Error('failed create delete message')
  }

  // メッセージ削除
  const deleteMessage = await Messages.findByIdAndDelete(message._id).session(session)
  if (!deleteMessage) {
    throw new Error('failed delete message')
  }

  // キャッシュのメッセージ削除
  await cache.deleteData(`msg:${mid}`)

  return deleteMessage
}

// コメント削除
const deleteComment = async (comment, session) => {
  
  // 削除コメント作成
  const _newComment = await _Comments.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: comment.gid,
      mid: comment.mid,
      cid: comment.cid,
      wgid: comment.wgid,
      wmoid: comment.wmoid,
      type: comment.type,
      text: comment.text,
      blocks: comment.blocks,
      images: comment.images,
      files: comment.files,
      ctime: comment.ctime,
      utime: dtUti.getNowUtime(),
    }],
    { session:session }
  )
  if (!_newComment) {
    throw new Error('failed create delete comment')
  }

  // コメント削除
  const deleteComment = await Comments.findByIdAndDelete(comment._id).session(session)
  if (!deleteComment) {
    throw new Error('failed delete comment')
  }

  return deleteComment
}

// スケジュール削除
const deleteSchedule = async (schedule, session) => {
  
  // 削除スケジュール作成
  const _newSchedule = await _Schedules.create(
    [{
      _id: new mongoose.Types.ObjectId,
      gid: schedule.gid,
      sid: schedule.sid,
      type: schedule.type,
      pub: schedule.pub,
      oid: schedule.oid,
      wgid: schedule.wgid,
      wmoid: schedule.wmoid,
      rgid: schedule.rgid,
      rsid: schedule.rsid,
      roid: schedule.roid,
      pmode: schedule.pmode,
      members: schedule.members,
      title: schedule.title,
      tflg: schedule.tflg,
      color: schedule.color,
      incount: schedule.incount,
      details: schedule.details,
      ymd: schedule.ymd,
      stime: schedule.stime,
      etime: schedule.etime,
      ctime: schedule.ctime,
      utime: dtUti.getNowUtime(),
      histories: schedule.histories,
    }],
    { session:session }
  )
  if (!_newSchedule) {
    throw new Error('failed create delete schedule')
  }

  // スケジュール削除
  const deleteSchedule = await Schedules.findByIdAndDelete(schedule._id).session(session)
  if (!deleteSchedule) {
    throw new Error('failed delete schedule')
  }

  return deleteSchedule
}

/*--------------------------------------------------*/

exports.deleteAccount = deleteAccount
exports.deleteGroup = deleteGroup
exports.deleteAddmember = deleteAddmember
exports.deleteMember = deleteMember
exports.deleteObject = deleteObject
exports.deleteMessage = deleteMessage
exports.deleteComment = deleteComment
exports.deleteSchedule = deleteSchedule
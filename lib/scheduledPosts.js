const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

/**
 * Publish due ScheduledPost rows into the classroom Post feed.
 * Requires classroom models already registered (index mounts classroom.js first).
 */
async function publishDueScheduledPosts() {
  const ScheduledPost = mongoose.model("ScheduledPost");
  const Post = mongoose.model("Post");

  const due = await ScheduledPost.find({
    published: false,
    scheduledFor: { $lte: new Date() },
  }).limit(100);

  const published = [];
  for (const sp of due) {
    await Post.create({
      postId: uuidv4(),
      classroomId: sp.classroomId,
      type: sp.type || "announcement",
      title: sp.title || "",
      body: sp.body || "",
      authorId: sp.authorId,
      authorName: sp.authorName,
      attachments: sp.attachments || [],
      dueDate: sp.dueDate,
      points: sp.points,
      topic: sp.topic || "",
    });
    sp.published = true;
    await sp.save();
    published.push(sp._id.toString());
  }
  return { count: published.length, ids: published };
}

module.exports = { publishDueScheduledPosts };

const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
let dateTime = require("date-fns");
app.use(express.json());
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000);
  } catch (e) {
    console.log(`DB ERROR:${e}`);
    process.exit(1);
  }
};
initializeDBAndServer();
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `SELECT * FROM user
    WHERE username="${username}";`;
  const getUser = await db.get(checkUserQuery);
  if (getUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const registerQuery = `INSERT INTO user (name,username,password,gender)
        VALUES ("${name}","${username}",${hashedPassword},"${gender}");`;
      await db.run(registerQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
        user_id: dbUser.user_id,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

const authenticateUser = async (request, response, next) => {
  let jwtToken;
  const authHead = request.headers["authorization"];
  if (authHead !== undefined) {
    jwtToken = authHead.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          const getUserQuery = `SELECT * FROM user 
          WHERE username="${payload.username}";`;
          const getDetails = await db.get(getUserQuery);
          request.user_id = getDetails.user_id;
          next();
        }
      });
    }
  }
};
const mutualUser = async (request, response, next) => {
  const { user_id } = request;
  let { tweetId } = request.params;
  const tweet_Id = parseInt(tweetId.split("")[1]);
  const checkQuery = `SELECT tweet.tweet_id FROM follower INNER JOIN tweet
  ON tweet.user_id=follower.following_user_id
  WHERE follower.follower_user_id=${user_id};`;
  const gettweet = await db.all(checkQuery);
  let isTweetPresent = false;
  const checkTweetId = await gettweet.map((eachObj) => {
    if (eachObj.tweet_id === tweet_Id) {
      isTweetPresent = true;
    }
  });
  if (isTweetPresent) {
    request.details = { user_id: user_id, tweet_Id: tweet_Id };
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};
app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const { user_id } = request;
  const getQuery = `SELECT user.username AS username ,tweet.tweet AS tweet , tweet.date_time AS dateTime  FROM follower INNER JOIN 
                      user ON follower.following_user_id=user.user_id
                      INNER JOIN tweet 
                      ON tweet.user_id=user.user_id
                      WHERE follower.follower_user_id=${user_id}
                      ORDER BY dateTime DESC 
                      LIMIT 4
                     ;`;
  const getDetails = await db.all(getQuery);
  response.send(getDetails);
});

app.get("/user/following/", authenticateUser, async (request, response) => {
  const { user_id } = request;
  const getQuery = `SELECT user.name AS name FROM user INNER JOIN follower
                      ON follower.following_user_id=user.user_id 
                      WHERE follower.follower_user_id=${user_id};`;
  const getDetails = await db.all(getQuery);
  response.send(getDetails);
});
app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { user_id } = request;
  const getQuery = `SELECT user.name AS name FROM user INNER JOIN follower
                      ON follower.follower_user_id=user.user_id 
                      WHERE follower.following_user_id=${user_id};`;
  const getDetails = await db.all(getQuery);
  response.send(getDetails);
});
app.get(
  "/tweets/:tweetId",
  authenticateUser,
  mutualUser,
  async (request, response) => {
    const { details } = request;
    const { user_id, tweet_Id } = details;
    console.log(user_id);
    const getQuery = `SELECT tweet.tweet AS tweet ,COUNT(reply.reply_id) AS replies,
    COUNT(like.like_id) AS likes ,tweet.date_time AS dateTime 
    FROM tweet INNER JOIN like
    ON tweet.tweet_id=like.tweet_id
    INNER JOIN reply 
    ON tweet.tweet_id=reply.tweet_id
    WHERE tweet.tweet_id=${tweet_Id};`;
    const getDetails = await db.get(getQuery);
    response.send(getDetails);
  }
);
app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  mutualUser,
  async (request, response) => {
    const { details } = request;
    const { user_id, tweet_Id } = details;
    const getQuery = `SELECT user.username AS likes  FROM tweet INNER JOIN like
    ON like.tweet_id=tweet.tweet_id
    INNER JOIN user
    ON like.user_id=user.user_id
    WHERE tweet.tweet_id=${tweet_Id};`;
    const getDetails = await db.all(getQuery);
    let newArr = [];
    let newObj = getDetails.map((eachObj) => {
      newArr.push(eachObj.likes);
    });
    response.send({ likes: newArr });
  }
);
app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  mutualUser,
  async (request, response) => {
    const { details } = request;
    const { user_id, tweet_Id } = details;
    const getQuery = `SELECT user.name AS name , reply.reply AS reply FROM tweet INNER JOIN reply
    ON tweet.tweet_id=reply.tweet_id
    INNER JOIN user 
    ON user.user_id = reply.user_id
    WHERE tweet.tweet_id=${tweet_Id};`;
    const getDetails = await db.all(getQuery);
    let newArr = [];
    let newObj = getDetails.map((eachObj) => {
      newArr.push({
        name: eachObj.name,
        reply: eachObj.reply,
      });
    });
    response.send({ replies: newArr });
  }
);
app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { user_id } = request;
  const getQuery = `SELECT tweet.tweet AS tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply_id) AS replies ,tweet.date_time AS dateTime 
    FROM tweet INNER JOIN reply 
    ON tweet.tweet_id=reply.tweet_id INNER JOIN 
    like ON tweet.tweet_id=like.tweet_id
    WHERE tweet.user_id=${user_id}
    GROUP BY tweet.tweet_id;`;
  const getDetails = await db.all(getQuery);
  response.send(getDetails);
});
app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { user_id } = request;
  const { tweet } = request.body;
  const newdate = `${new Date()}`;
  const date = new Date(newdate);
  const year = date.getFullYear();
  const month =
    date.getMonth() + 1 < 10 ? `0${date.getMonth() + 1}` : date.getMonth() + 1;
  const day = date.getDate() < 10 ? `0${date.getDate()}` : date.getDate();
  const hours = date.getHours() < 10 ? `0${date.getHours()}` : date.getHours();
  const minutes =
    date.getMinutes() < 10 ? `0${date.getMinutes()}` : date.getMinutes();
  const seconds =
    date.getSeconds() < 10 ? `0${date.getSeconds()}` : date.getSeconds();

  const outputDateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  console.log(outputDateString);
  const postQuery = `INSERT INTO tweet (tweet,user_id,date_time)
    VALUES(${tweet},${user_id},${outputDateString});`;
  await db.run(postQuery);
  response.send("Created a Tweet");
});
app.delete(
  "/tweets/:tweetId/",
  authenticateUser,
  mutualUser,
  async (request, response) => {
    const { details } = request;
    const { user_id, tweet_Id } = details;
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweet_Id};`;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  }
);
module.exports = app;

const express = require("express")
const app = express();
const serv = require("http").Server(app);
const { Server } = require("socket.io");
const io = new Server(serv);

const gameList = require("./server/gameList");
const Game = require("./server/game");

app.get("/", (req, res) => {
    res.sendFile(`${__dirname}/client/index.html`);
});

app.use("/robots.txt", express.static(__dirname + "/client/robots.txt"));

app.get("/:gameID", (req, res) => {
  let gameID = req.params.gameID;
  if(gameList[gameID] === undefined){
    gameList[gameID] = new Game();
    res.sendFile(`${__dirname}/client/game.html`);
  }
  else if(gameList[gameID].state == Game.States.lobby){
    res.sendFile(`${__dirname}/client/game.html`);
  }
  else{
    res.redirect("/");
  }
});

app.use("/client", express.static(__dirname + "/client"));

io.on('connection', (socket) => {
    socket.on("join game", (data) => {
      if(gameList[data.gameID] === undefined){
        gameList[data.gameID] = new Game();
        gameList[data.gameID].addUser(socket, data);
      }
      else if(gameList[data.gameID].state == Game.States.lobby){
        gameList[data.gameID].addUser(socket, data);
      }
      else{
        socket.disconnect();
      }
    });
});

// Clear empty games.
setInterval(() => {
  Object.keys(gameList).forEach((key, index) => {
    if(Object.keys(gameList[key].users).length < 1){
      delete gameList[key];
    }
});
}, 5000);

serv.listen(2000);
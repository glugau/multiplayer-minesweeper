const socket = io();
let _wpa = window.location.pathname.split('/');
const gameID = _wpa[_wpa.length - 1] == "" ?  _wpa[_wpa.length - 2] : _wpa[_wpa.length - 1];
document.title = "Multiplayer Minesweeper - " + gameID; 
const gameURL = document.location.origin + "/" + gameID;
var isHost = false;
var uid = -1;
var gameSettings = {
    width: 0,
    height: 0,
    mines: 0,
};

var gameGrid = {};

var inGame = false;
var allReady = false;
var gameOver = false;
var gameOverBombPos;

const canvasX = 700;
var canvasY;
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const flagImage = new Image();
const mineImage = new Image();
flagImage.src = "/client/img/flag.png";
mineImage.src = "/client/img/mine.png"

let sessionUsername = window.sessionStorage.getItem("username");
if(sessionUsername != null){
    document.getElementById("username-text-field").value = sessionUsername;
    sendUsername();
    window.sessionStorage.clear();
}

document.getElementById("username-game-id").innerText = "Code: " + gameID;

let urlDisplayElems = document.getElementsByClassName("game-url-display-text");
for (let elem of urlDisplayElems) {
    elem.value = gameURL;
}

createSocketCallbacks();
addInputListeners();






// === FUNCTIONS ===

function addInputListeners(){
    canvas.addEventListener("click", event =>{
        if(!inGame) return;

        let pos = getEventPosInCanvas(event);
        let gridPos = posToGridPos(pos.x, pos.y);
        socket.emit("leftclick", gridPos);
    });
    canvas.addEventListener('contextmenu', event => {
        if(!inGame) return;

        event.preventDefault();
        let pos = getEventPosInCanvas(event);
        let gridPos = posToGridPos(pos.x, pos.y);
        socket.emit("rightclick", gridPos);
    });
}

function getEventPosInCanvas(event){
    let rect = canvas.getBoundingClientRect();
    let x = event.clientX - rect.left; //x position within the element.
    let y = event.clientY - rect.top;  //y position within the element.
    return {x: x, y: y};
}

function posToGridPos(x, y){
    let cellSize = canvasX / gameSettings.width;
    return {
        x: Math.floor(x / cellSize),
        y: Math.floor(y / cellSize),
    };
}

function createSocketCallbacks(){
    
    socket.on("disconnect", ()=>{
        window.location.href = "/"
    });

    socket.on("player list", list=>{
        let string = "";
        list.forEach(element => {
            let you = "";
            if(element.uid == uid){
                string += "<li class=\"menu-selection-box\" id=\"local-user-in-list\">";
                you = "<span style=\"font-weight: bold;\"> (You)</span>";
            }
            else{
                string += "<li class=\"menu-selection-box\">";
            }

            if(element.host){
                string += "<span class=\"player-list-icon\"><i class=\"fas fa-crown\"></i></span>";
            }
            string += `<span class="player-list-name">${htmlEntities(element.username)}</span>${you}`;
            string += "</li>";
        });

        for(let elem of document.getElementsByClassName("player-list-list")){
            elem.innerHTML = string;
        }
    });

    socket.on("lobby update", data => {
        let iwidth = document.getElementById("lobby-setting-grid-width-input");
        let iheight = document.getElementById("lobby-setting-grid-height-input");
        let imines = document.getElementById("lobby-setting-mine-amount-input");

        iwidth.value = data.width;
        iheight.value = data.height;
        imines.value = data.mines;

        iwidth.nextElementSibling.value = iwidth.value;
        iheight.nextElementSibling.value = iheight.value;
        imines.nextElementSibling.value = imines.value;

        gameSettings.width = data.width;
        gameSettings.height = data.height;
        gameSettings.mines = data.mines;

        canvasY = Math.round(canvasX * (data.height / data.width));
        let canvas = document.getElementById("game-canvas");
        canvas.style.width = canvasX + "px";
        canvas.style.height = canvasY + "px";

    });

    socket.on("lobby difficulty", diff => {
        document.getElementById("lobby-setting-difficulty").value = diff;
    });

    socket.on("host status", host=>{
        let difficultyElem = document.getElementById("lobby-setting-difficulty");
        difficultyElem.disabled = !host;
        isHost = host;
        setDifficulty(difficultyElem.value);
        if(host){
            document.getElementById("start-game-btn").disabled = false;
            document.getElementById("start-game-btn").style.backgroundColor = null;
        }
    });

    socket.on("player uid", id => { uid = id; });

    socket.on("game start", data => {
        setChronoDisplay("0");
        setBombDisplay(gameSettings.mines);
        setActiveDivID("game-main");
        gameGrid = {};
        inGame = true;
        allReady = false;
        drawGrid();
        canvas.height = canvasY;
        canvas.width = canvasX;
    });

    socket.on("chrono time", c => {setChronoDisplay(c);});

    socket.on("game grid", grid => {
        gameGrid = grid;
        setBombDisplay(getRemainingBombCount());
        getMineCounts();
    });

    socket.on("all ready", () => { allReady = true; });

    socket.on("game over", pos => {gameOverBombPos = pos; gameOver = true;});

    socket.on("restart game", () => {
        setActiveDivID("lobby-wrapper");
        inGame = false;
        allReady = false;
        gameOver = false;
    });
}

function setActiveDivID(divname){
    document.getElementById("username-selection-wrapper").style.display = "none";
    document.getElementById("lobby-wrapper").style.display = "none";
    document.getElementById("game-main").style.display = "none";
    
    document.getElementById(divname).style.display = "flex";
}

function validUsername(name){
    return !(name.length < 3 || name.length > 12);
}

function sendUsername(){
    let username = document.getElementById("username-text-field").value;
    if(validUsername(username)){
        socket.emit("join game", {
            gameID: gameID,
            username: username,
        });
        setActiveDivID("lobby-wrapper");
    }
    else{
        alert("Name must be between 3 and 12 characters long.");
    }
}

function copyURLToClipboard(){
    navigator.clipboard.writeText(gameURL);
}

function setDifficulty(diff){
    let widthInput = document.getElementById("lobby-setting-grid-width-input");
    let heightInput = document.getElementById("lobby-setting-grid-height-input");
    let minesInput = document.getElementById("lobby-setting-mine-amount-input");
    let enabled = diff == "custom" && isHost;
    widthInput.disabled = !enabled;
    heightInput.disabled = !enabled;
    minesInput.disabled = !enabled;

    if(diff == "beginner"){
        widthInput.value = 9;
        heightInput.value = 9;
        minesInput.value = 10;
    }
    else if(diff == "intermediate"){
        widthInput.value = 16;
        heightInput.value = 16;
        minesInput.value = 40;
    }
    else if(diff == "expert"){
        widthInput.value = 30;
        heightInput.value = 16;
        minesInput.value = 99;
    }

    widthInput.oninput();
    heightInput.oninput();
    minesInput.oninput();
}

function updateSettings(){
    let modeList = document.getElementById("lobby-setting-difficulty");
    let widthInput = document.getElementById("lobby-setting-grid-width-input");
    let heightInput = document.getElementById("lobby-setting-grid-height-input");
    let minesInput = document.getElementById("lobby-setting-mine-amount-input");

    socket.emit("lobby difficulty", modeList.value);

    socket.emit("lobby update", {
        width: widthInput.value,
        height: heightInput.value,
        mines: minesInput.value,
    });
}

function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function startGame(){
    socket.emit("start game");
}

function setBombDisplay(count){
    document.getElementById("bomb-count-display").innerHTML = `<i class="fas fa-bomb"></i>${count}`;
}

function setChronoDisplay(count){
    document.getElementById("chrono-display").innerHTML = `<i class="fas fa-stopwatch"></i>${count}`;
    
}

function getRemainingBombCount(){
    let keys = Object.keys(gameGrid);
    let count = gameSettings.mines;
    for(let key of keys){
        if(gameGrid[key].flag){
            --count;
        }
    }
    return count;
}

function getMineCounts(){
    let keys = Object.keys(gameGrid);
    for(let key of keys){
        if(gameGrid[key].swept){
            let count = 0;
            let arr = key.split("-");
            let x = parseInt(arr[0]);
            let y = parseInt(arr[1]);
            if(gameGrid[`${x-1}-${y-1}`]?.bomb)
                ++count;
            if(gameGrid[`${x}-${y-1}`]?.bomb)
                ++count;
            if(gameGrid[`${x+1}-${y-1}`]?.bomb)
                ++count;
            if(gameGrid[`${x-1}-${y}`]?.bomb)
                ++count;
            if(gameGrid[`${x+1}-${y}`]?.bomb)
                ++count;
            if(gameGrid[`${x-1}-${y+1}`]?.bomb)
                ++count;
            if(gameGrid[`${x}-${y+1}`]?.bomb)
                ++count;
            if(gameGrid[`${x+1}-${y+1}`]?.bomb)
                ++count;
            gameGrid[key].count = count;
        }
    }
}

function drawGrid(){
    let cellSize = canvasX / gameSettings.width;
    let colors = {
        cell1: "rgb(95, 119, 255)",
        cell2: "rgb(52, 82, 255)",
        swept1: "rgb(135, 135, 135)",
        swept2: "rgb(150, 150, 150)",
        initial: "rgb(147, 70, 70)",
        bomb: "rgb(255, 0, 0)",

    };

    let countColors = [
        "rgb(0, 0, 0)", // 0 is useless
        "rgb(0, 0, 255)",
        "rgb(0, 128, 0)",
        "rgb(255, 0, 0)",
        "rgb(0, 0, 128)",
        "rgb(128, 0, 0)",
        "rgb(0, 128, 128)",
        "rgb(0, 0, 0)",
        "rgb(0, 0, 0)",
    ];

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for(let x = 0; x < gameSettings.width; ++x){
        for(let y = 0; y < gameSettings.height; ++y){
            let color = ((y%2) + x) % 2 === 0;
            let cx = x * cellSize;
            let cy = y * cellSize;

            if(gameOver && gameOverBombPos.x == x && gameOverBombPos.y == y){
                ctx.fillStyle = colors.bomb;
            }
            else if(!allReady && gameGrid[`${x}-${y}`]?.initial)
                ctx.fillStyle = colors.initial;
            else if(gameGrid[`${x}-${y}`]?.swept && color)
                ctx.fillStyle = colors.swept2;
            else if(gameGrid[`${x}-${y}`]?.swept)
                ctx.fillStyle = colors.swept1;
            else if(color)
                ctx.fillStyle = colors.cell1;
            else
                ctx.fillStyle = colors.cell2;

            ctx.fillRect(cx, cy, cellSize, cellSize);


            if(gameOver && gameGrid[`${x}-${y}`]?.bomb){
                ctx.drawImage(mineImage, x * cellSize, y * cellSize, cellSize, cellSize);
            }
            else if(gameGrid[`${x}-${y}`]?.flag){
                ctx.drawImage(flagImage, x * cellSize, y * cellSize, cellSize, cellSize);
            }
            else if(gameGrid[`${x}-${y}`]?.swept){
                if(gameGrid[`${x}-${y}`].count !== undefined){
                    if(gameGrid[`${x}-${y}`].count > 0){
                        let count = gameGrid[`${x}-${y}`].count;
                        ctx.fillStyle = countColors[count];
                        ctx.font = `${cellSize * 0.9}px sans-serif`;
                        ctx.fillText(`${count}`, x * cellSize + cellSize / 2.0, y * cellSize + cellSize / 2.0);
                    }
                }
            }
        }
    }

    let fsize = 50;
    let gap = 50;
    let distanceFromLowY = canvasY / 2.0;

    if(gameOver && gameOverBombPos.x > -1)
    {
        let text1 = "GAME OVER!";
        let text2 = "Host: Click to restart...";
        ctx.fillStyle = "red";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.font = `bold ${fsize}px sans-serif`;
        ctx.fillText(text1, canvasX / 2.0, canvasY - distanceFromLowY - gap / 2.0);
        ctx.strokeText(text1, canvasX / 2.0, canvasY - distanceFromLowY - gap / 2.0);
        ctx.font = `${fsize}px sans-serif`;
        ctx.fillText(text2, canvasX / 2.0, canvasY - distanceFromLowY + gap / 2.0);
        ctx.strokeText(text2, canvasX / 2.0, canvasY - distanceFromLowY + gap / 2.0);
    }
    else if(gameOver)
    {
        ctx.fillStyle = "rgb(4, 244, 4)";
        ctx.font = `bold ${fsize}px sans-serif`;
        ctx.fillText("YOU WON!", canvasX / 2.0, canvasY - distanceFromLowY - gap / 2.0);
        ctx.font = `${fsize}px sans-serif`;
        ctx.fillText("Host: Click to restart...", canvasX / 2.0, canvasY - distanceFromLowY + gap / 2.0);
    }


    if(inGame){
        requestAnimationFrame(drawGrid);
    }
}
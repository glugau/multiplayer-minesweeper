var uidCounter = 0;

function getValidUsername(name){
    if(name.length < 3 || name.length > 12) return "Anonymous";
    return name;
}

class Cell{
    constructor(){
        this.flag = false;
        this.swept = false;
        this.initial = false;
        this.bomb = false;
    }
}

class Game{
    constructor(){
        this.users = {};
        this.state = Game.States.lobby;
        this.grid = {};
        this.settings = {
            width: 9,
            height: 9,
            mines: 10,
            difficulty: "beginner",
        };
        this.chrono = 0;
        this.allReady = false;
        this.gameOver = false;
    }
    
    static States = {
        lobby: 0,
        running: 1
    }

    addUser(socket, data){
        let uid = uidCounter;
        uidCounter++;

        let host = (Object.keys(this.users).length < 1);
        this.users[uid] = {
          username: getValidUsername(data.username),
          socket: socket,
          host: host,
          ready: false,
        };

        socket.on('disconnect', () => {
            let wasHost = this.users[uid].host;
            delete this.users[uid];
            if(wasHost){
                let keys = Object.keys(this.users);
                if(keys.length > 0){
                    let newHostuid = keys[ keys.length * Math.random() << 0];
                    this.users[newHostuid].host = true;
                    this.users[newHostuid].socket.emit("host status", true);
                }
            }
            this.emitAll("player list", this.getPlayerList());
            if(this.state == Game.States.running && !this.allReady){
                this.updateAllReady();
                if(this.allReady){
                    this.onAllReady();
                }
            }
        });

        socket.on("lobby update", data =>{
            if(!this.users[uid].host) return;

            this.settings.width = data.width;
            this.settings.height = data.height;
            this.settings.mines = data.mines;

            this.emitAllExcept("lobby update", {
                width: data.width,
                height: data.height,
                mines: data.mines,
            }, uid);
        });

        socket.on("lobby difficulty", diff => {
            if(!this.users[uid].host) return;
            this.emitAllExcept("lobby difficulty", diff, uid);
            this.settings.difficulty = diff;
        });

        socket.on("start game", () => {
            if(!this.users[uid].host) return;
            Object.keys(this.users).forEach((key, value) => {
                this.users[key].ready = false;
            });
            this.allReady = false;
            this.grid = {};
            this.gameOver = false;
            for(let x = 0; x < this.settings.width; ++x){
                for(let y = 0; y < this.settings.height; ++y){
                    this.grid[`${x}-${y}`] = new Cell();
                }
            }

            clearInterval(this.chronoInterval);
            this.chrono = 0;

            this.state = Game.States.running;
            this.emitAll("lobby update", {
                width: this.settings.width,
                height: this.settings.height,
                mines: this.settings.mines,
            });
            this.emitAll("game start");
        });

        socket.on("leftclick", gpos => {
            if(this.state != Game.States.running) return;
            if(gpos.x < 0 || gpos.x > this.settings.width - 1 || gpos.y < 0 || gpos.y > this.settings.width - 1) return;
            if(this.gameOver){
                if(!this.users[uid].host) return;
                this.emitAll("restart game");
                this.state = Game.States.lobby;
                this.grid = {};
                this.chrono = 0;
                this.allReady = false;
                this.gameOver = false;
            }
            else{
                if(!this.allReady){
                    if(!this.users[uid].ready){
                        if(!this.grid[`${gpos.x}-${gpos.y}`].initial){
                            this.grid[`${gpos.x}-${gpos.y}`].initial = true;
                            this.users[uid].ready = true;
                            this.updateAllReady();
                            this.emitAll("game grid", this.grid);
    
                            if(this.allReady){
                                this.onAllReady();
                            }
                        }
                    }
                }
                else{
                    this.trySweep(gpos.x, gpos.y);
                    this.emitAll("game grid", this.grid);
                }
            }
        });

        socket.on("middleclick", gpos => {
            if(this.state != Game.States.running) return;
            if(gpos.x < 0 || gpos.x > this.settings.width - 1 || gpos.y < 0 || gpos.y > this.settings.width - 1) return;

            this.trySweep(gpos.x-1, gpos.y-1);
            this.trySweep(gpos.x, gpos.y-1);
            this.trySweep(gpos.x+1, gpos.y-1);
            this.trySweep(gpos.x-1, gpos.y);
            this.trySweep(gpos.x, gpos.y);
            this.trySweep(gpos.x+1, gpos.y);
            this.trySweep(gpos.x-1, gpos.y+1);
            this.trySweep(gpos.x, gpos.y+1);
            this.trySweep(gpos.x+1, gpos.y+1);
            this.emitAll("game grid", this.grid);
        });

        socket.on("rightclick", gpos => {
            if(this.state != Game.States.running) return;
            if(gpos.x < 0 || gpos.x > this.settings.width - 1 || gpos.y < 0 || gpos.y > this.settings.width - 1) return;
            if(!this.allReady) return;
            if(this.grid[`${gpos.x}-${gpos.y}`].swept) return;
            if(this.gameOver) return;

            this.grid[`${gpos.x}-${gpos.y}`].flag = !this.grid[`${gpos.x}-${gpos.y}`].flag;
            this.emitAll("game grid", this.grid);
        });

        socket.emit("host status", host);
        socket.emit("lobby difficulty", this.settings.difficulty);
        socket.emit("lobby update", {
            width: this.settings.width,
            height: this.settings.height,
            mines: this.settings.mines,
        });
        socket.emit("player uid", uid);
    
        this.emitAll("player list", this.getPlayerList());
    }

    emitAll(event, data){
        Object.keys(this.users).forEach((key, index) => {
            this.users[key].socket.emit(event, data);
        });
    }

    emitAllExcept(event, data, uid){
        Object.keys(this.users).forEach((key, index) => {
            if(key == uid) return;
            this.users[key].socket.emit(event, data);
        });
    }

    getPlayerList(){
        let playerList = [];
        Object.keys(this.users).forEach((key, index) => {
            playerList.push({
                username: this.users[key].username,
                uid: key,
                host: this.users[key].host,
            });
        });
        return playerList;
    }

    startChrono(){
        this.chrono = 0;
        this.chronoInterval = setInterval(()=>{
            this.chrono++;
            this.emitAll("chrono time", this.chrono);
        }, 1000);
    }
    
    stopChrono(){
        clearInterval(this.chronoInterval);
    }

    updateAllReady(){
        this.allReady = true;
        Object.keys(this.users).forEach((key, value) => {
            if(!this.users[key].ready){
                this.allReady = false;
            }
        });
    }

    onAllReady(){
        this.emitAll("all ready");
        this.generateBombs();

        let keys = Object.keys(this.grid);
        for(let key of keys){
            if(this.grid[key].initial){
                let pos = key.split("-");
                this.trySweep(parseInt(pos[0]), parseInt(pos[1]));
            }
        }

        this.startChrono();
        this.emitAll("game grid", this.grid);
    }

    generateBombs(){
        let keys = Object.keys(this.grid);
        let toRemove = [];
        for(let key of keys){
            if(this.grid[key].initial){
                toRemove.push(key);
            }
        }

        for(let key of toRemove){
            let index = keys.indexOf(key);
            if (index !== -1) {
             keys.splice(index, 1);
            }
        }
        const shuffled = keys.sort(() => 0.5 - Math.random());
        let bombed = shuffled.slice(0, this.settings.mines);
        for(let key of bombed){
            this.grid[key].bomb = true;
        }
    }

    trySweep(x, y){
        if(this.grid[`${x}-${y}`] === undefined) return;

        if(this.grid[`${x}-${y}`].swept) return;
        if(this.grid[`${x}-${y}`].flag) return;
        if(this.grid[`${x}-${y}`].bomb){
            this.doGameOver(x, y);
        }
        else{
            this.grid[`${x}-${y}`].flag = false;
            this.grid[`${x}-${y}`].swept = true;
            if(this.hasWon()){
                this.doGameOver();
                return;
            }
            if(this.getSurroundingBombCount(x, y) == 0){
                this.trySweep(x-1, y-1);
                this.trySweep(x, y-1);
                this.trySweep(x+1, y-1);
                this.trySweep(x-1, y);
                this.trySweep(x+1, y);
                this.trySweep(x-1, y+1);
                this.trySweep(x, y+1);
                this.trySweep(x+1, y+1);
            }

        }
    }

    getSurroundingBombCount(x, y){
        let count = 0;
        if(this.grid[`${x-1}-${y-1}`]?.bomb)
            ++count;
        if(this.grid[`${x}-${y-1}`]?.bomb)
            ++count;
        if(this.grid[`${x+1}-${y-1}`]?.bomb)
            ++count;
        if(this.grid[`${x-1}-${y}`]?.bomb)
            ++count;
        if(this.grid[`${x+1}-${y}`]?.bomb)
            ++count;
        if(this.grid[`${x-1}-${y+1}`]?.bomb)
            ++count;
        if(this.grid[`${x}-${y+1}`]?.bomb)
            ++count;
        if(this.grid[`${x+1}-${y+1}`]?.bomb)
            ++count;
        
        return count;
    }

    hasWon(){
        let keys = Object.keys(this.grid);
        for(let key of keys){
            if(!this.grid[key].swept && !this.grid[key].bomb){
                return false;
            }
        }
        return true;
    }

    doGameOver(x=-1, y=-1){
        this.emitAll("game over", {x: x, y: y,});
        this.gameOver = true;
        this.stopChrono();
    }
}

module.exports = Game;
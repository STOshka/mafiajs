const { Game, Round, Player } = require("../db/models");
const { whoToSendBack, shuffle, assignRoles } = require("../game.js");
const axios = require("axios");

module.exports = io => {
  const clients = {};
  io.on("connection", socket => {
    console.log(
      `A socket connection to the server has been made: ${socket.id}`
    );

    let game;

    socket.on("joinGame", ({ name, id, gameId }) => {
      game = gameId;
      socket.join(game);
      socket.userName = name;
      clients[id] = socket.id;
      socket.broadcast.to(game).emit("playerJoined", {
        name,
        id
      });
    });
    socket.on("addGameToServer", createdGame => {
      socket.broadcast.emit("newGameAdded", createdGame);
    });

    socket.on("disconnect", () => {
      console.log(`Connection ${socket.id} is no longer connected!`);
    });

    function gameRun(gameId) {
      io.to(gameId).emit("dark");
      console.log("we are running game run");
      setTimeout(() => {
        console.log("dark timer over for villagers"); //this works!
        io.to(gameId).emit("darkOverForVillagers");
      }, 25000);
      setTimeout(() => {
        console.log("dark timer over for mafia"); //this works!
        io.to(gameId).emit("darkOverForMafia");
      }, 30000);
    }

    socket.on("gameStart", gameId => {
      Game.findById(gameId, { include: [Player] })
        .then(game => {
          if (game.inProgress) {
            return;
          }
          return game
            .update({ inProgress: true })
            .then(updatedGame => {
              const idArray = game.players.map(el => el.id);
              const shuffledPlayers = assignRoles(shuffle(idArray));
              const creatingPlayers = game.players.map(player =>
                player.update(shuffledPlayers[player.id])
              );
              const newRound = Round.create({
                gameId: updatedGame.id,
                number: 1
              });
              return Promise.all([...creatingPlayers, newRound]);
            })
            .then(players => {
              players.pop();
              players.forEach(player => {
                if (clients[player.id]) {
                  io.to(clients[player.id]).emit("role", player.role);
                }
              });
              gameRun(gameId);
            });
        })
        .catch(err => console.log(err));
    });

    socket.on("villagerChoice", data => {
      const { gameId, saved, guess } = data;
      console.log("who got saved on the back end socket?", data);
      if (guess) {
        Player.findById(guess)
          .then(foundPlayer => {
            if (foundPlayer.isMafia()) {
              io.to(socket.id).emit("DetectiveRight");
            } else {
              io.to(socket.id).emit("DetectiveWrong");
            }
          })
          .catch(err => console.error(err));
      } else {
        Round.findOne({
          where: {
            gameId: gameId,
            isCurrent: true
          }
        })
          .then(round => {
            return round.update({
              saved: saved
            });
          })
          .catch(err => console.error(err));
      }
    });

    socket.on("darkData", darkData => {
      let { killed, gameId } = darkData;
      console.log("who got killed on the back end socket?", darkData);
      Round.findOne({
        where: {
          gameId: gameId,
          isCurrent: true
        }
      }).then(round => {
        if (!round) {
          return;
        }
        let actualSaved = round.saved;
        let person = whoToSendBack(killed, actualSaved);
        const whoDied = person.saved ? null : person.killed;
        const roundUpdate = {
          died: whoDied,
          killed,
          isCurrent: false
        };

        let proms = [round.update(roundUpdate)];
        if (whoDied) {
          proms.push(
            Player.update(
              {
                isAlive: false,
                role: "Dead"
              },
              {
                where: {
                  gameId: gameId,
                  id: whoDied
                },
                returning: true
              }
            )
          );
        }
        return Promise.all(proms)
          .then(resolved => {
            if (resolved[1]) {
              return resolved[1][1][0].checkGameStatus();
            }
          })
          .then(() => {
            return Game.findById(gameId);
          })
          .then(updatedGame => {
            if (updatedGame.winner) {
              io.to(gameId).emit("gameOver", updatedGame.winner);
            } else {
              console.log("creating a round right now!");
              return Round.create({
                gameId: gameId,
                isCurrent: true
              }).then(round => {
                if (round) {
                  io.to(gameId).emit("daytime", person);
                }
              });
            }
          })
          .catch(err => console.error(err));
      });
    });

    socket.on("myVote", voteData => {
      io.to(game).emit("myVote", voteData);
    });

    socket.on("daytimeVotes", votes => {
      console.log("here is day time votes");
      let promsArray = [];
      io.to(game).emit("resetVotes");
      let countedVotes = {};

      for (let key in votes) {
        if (!countedVotes[votes[key]]) countedVotes[votes[key]] = 1;
        else countedVotes[votes[key]]++;
      }

      const votedOutId = Object.keys(countedVotes).reduce(
        (a, b) => (countedVotes[a] > countedVotes[b] ? a : b)
      );
      let wasMafia;
      Player.findById(+votedOutId)
        .then(foundPlayer => {
          if (foundPlayer.role === "Lead Mafia") {
            promsArray.push(Player.isLeadMafiaDead(foundPlayer.gameId));
          }
          if (
            foundPlayer.role === "Mafia" ||
            foundPlayer.role === "Lead Mafia"
          ) {
            wasMafia = true;
          } else {
            wasMafia = false;
          }
          promsArray.push(foundPlayer.update({ role: "Dead" }));
          return Promise.all(promsArray)
            .then(() => {
              return foundPlayer.checkGameStatus();
            })
            .then(foundGame => {
              if (foundGame.winner) {
                console.log("game ended for real");
                io.to(foundGame.id).emit("gameOver", foundGame.winner);
              } else {
                io
                  .to(foundGame.id)
                  .emit("votesData", foundPlayer.name, !!wasMafia);
                io.to(foundGame.id).emit("getRoles");
                setTimeout(() => {
                  gameRun(foundGame.id);
                }, 30000);
                console.log("here we go again");
              }
            });
        })
        .catch(err => console.error(err));
    });

    //we need to have an on 'votesarein' that changes the front end rendering and lets everyone know who died and if they were mafia, gives a few seconds,then goes back to dark
  });
};

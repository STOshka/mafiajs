//as players join the room they are pushed to playersArray = []

//fisher yates shuffle:
function shuffle(playersArray) {
  let counter = array.length;

  while (counter > 0) {
    let index = Math.floor(Math.random() * counter);

    counter--;

    let temp = array[counter];
    array[counter] = array[index];
    array[index] = temp;
  }

  return array;
}

function assignRoles(shuffled) {
  let result = {};

  const totalMafia = Math.floor(shuffled.length / 2 - 1);

  //arrays of players
  const maf = shuffled.splice(0, totalMafia);
  const det = [shuffled.pop()];
  const doc = [shuffled.pop()];
  const civ = shuffled;

  result[mafia] = maf;
  result[detective] = det;
  result[doctor] = doc;
  result[civilian] = civ;

  return result;
}

//roles.mafia = []

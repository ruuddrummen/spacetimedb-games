import { useCallback } from "react";
import { tables, reducers } from "../module_bindings";
import { useSpacetimeDB, useTable, useReducer } from "spacetimedb/react";
import { useIdentity } from "../context";

export function useGameState() {
  const conn = useSpacetimeDB();
  const { isActive: connected } = conn;
  const identity = useIdentity();

  const [games] = useTable(tables.game);
  const [players] = useTable(tables.player);
  const [foods] = useTable(tables.food);
  const [users] = useTable(tables.user);

  const setName = useReducer(reducers.setName);
  const createLobby = useReducer(reducers.createLobby);
  const joinLobby = useReducer(reducers.joinLobby);
  const leaveLobby = useReducer(reducers.leaveLobby);
  const closeLobby = useReducer(reducers.closeLobby);
  const startGame = useReducer(reducers.startGame);
  const changeDir = useReducer(reducers.changeDirection);
  const restartGame = useReducer(reducers.restartGame);

  const handleChangeDirection = useCallback(
    (dir: string) => changeDir({ direction: dir }),
    [changeDir],
  );

  const myUser = identity
    ? users.find((u) => u.identity.toHexString() === identity.toHexString())
    : null;

  const myPlayer = identity
    ? players.find((p) => p.identity.toHexString() === identity.toHexString())
    : null;

  const myGame = myPlayer
    ? (games.find((g) => g.id === myPlayer.gameId) ?? null)
    : null;

  const isHost = !!(
    identity &&
    myGame &&
    myGame.hostIdentity.toHexString() === identity.toHexString()
  );

  return {
    connected,
    identity,
    games,
    players,
    foods,
    users,
    myUser: myUser ?? null,
    myPlayer: myPlayer ?? null,
    myGame,
    isHost,
    actions: {
      setName: (name: string) => setName({ name }),
      createLobby: () => createLobby(),
      joinLobby: (gameId: bigint) => joinLobby({ gameId }),
      leaveLobby: () => leaveLobby(),
      closeLobby: () => closeLobby(),
      startGame: () => startGame(),
      changeDirection: handleChangeDirection,
      restartGame: () => restartGame(),
    },
  };
}

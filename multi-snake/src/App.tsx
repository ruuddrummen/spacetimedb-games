import { useGameState } from "./hooks/useGameState";
import { ConnectingScreen } from "./components/ConnectingScreen";
import { MainMenuScreen } from "./components/MainMenuScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { GameScreen } from "./components/GameScreen";
import { GameOverScreen } from "./components/GameOverScreen";

function App() {
  const {
    connected,
    subscriptionReady,
    identity,
    games,
    players,
    foods,
    users,
    myUser,
    myPlayer,
    myGame,
    isHost,
    actions,
  } = useGameState();

  if (!connected || !subscriptionReady) return <ConnectingScreen />;

  if (!myPlayer || !myGame) {
    return (
      <MainMenuScreen
        userRow={myUser}
        games={games}
        users={users}
        players={players}
        onSetName={actions.setName}
        onCreateLobby={actions.createLobby}
        onJoinLobby={actions.joinLobby}
      />
    );
  }

  if (myGame.phase === "lobby") {
    return (
      <LobbyScreen
        game={myGame}
        players={players}
        isHost={isHost}
        onStart={actions.startGame}
        onLeave={actions.leaveLobby}
        onClose={actions.closeLobby}
        identity={identity}
      />
    );
  }

  if (myGame.phase === "playing") {
    return (
      <GameScreen
        game={myGame}
        players={players}
        foods={foods}
        identity={identity}
        onChangeDirection={actions.changeDirection}
        onLeave={actions.leaveLobby}
      />
    );
  }

  if (myGame.phase === "finished") {
    return (
      <GameOverScreen
        game={myGame}
        players={players}
        isHost={isHost}
        onRestart={actions.restartGame}
        onLeave={actions.leaveLobby}
      />
    );
  }

  return <ConnectingScreen />;
}

export default App;

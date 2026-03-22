import { useGameState } from "./hooks/useGameState";
import { ConnectingScreen } from "./components/ConnectingScreen";
import { MainMenuScreen } from "./components/MainMenuScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { GameScreen } from "./components/GameScreen";
import { GameOverScreen } from "./components/GameOverScreen";
import { useConnectionStatus } from "./context";

const disconnectedBanner: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  background: "rgba(180, 40, 40, 0.95)",
  color: "#fff",
  textAlign: "center",
  padding: "0.5rem",
  fontSize: "0.85rem",
  zIndex: 9999,
};

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

  const { error } = useConnectionStatus();

  if (!connected || !subscriptionReady) return <ConnectingScreen />;

  const showDisconnectedBanner = !!error;

  if (!myPlayer || !myGame) {
    return (
      <>
        {showDisconnectedBanner && (
          <div style={disconnectedBanner}>{error}</div>
        )}
        <MainMenuScreen
          userRow={myUser}
          games={games}
          users={users}
          players={players}
          onSetName={actions.setName}
          onCreateLobby={actions.createLobby}
          onJoinLobby={actions.joinLobby}
        />
      </>
    );
  }

  if (myGame.phase === "lobby") {
    return (
      <>
        {showDisconnectedBanner && (
          <div style={disconnectedBanner}>{error}</div>
        )}
        <LobbyScreen
          game={myGame}
          players={players}
          isHost={isHost}
          onStart={actions.startGame}
          onLeave={actions.leaveLobby}
          onClose={actions.closeLobby}
          identity={identity}
        />
      </>
    );
  }

  if (myGame.phase === "playing") {
    return (
      <>
        {showDisconnectedBanner && (
          <div style={disconnectedBanner}>{error}</div>
        )}
        <GameScreen
          game={myGame}
          players={players}
          foods={foods}
          identity={identity}
          onChangeDirection={actions.changeDirection}
          onLeave={actions.leaveLobby}
        />
      </>
    );
  }

  if (myGame.phase === "finished") {
    return (
      <>
        {showDisconnectedBanner && (
          <div style={disconnectedBanner}>{error}</div>
        )}
        <GameOverScreen
          game={myGame}
          players={players}
          isHost={isHost}
          onRestart={actions.restartGame}
          onLeave={actions.leaveLobby}
        />
      </>
    );
  }

  return <ConnectingScreen />;
}

export default App;

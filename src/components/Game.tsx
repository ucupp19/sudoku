import { useContext, useState } from "react";
import {
  NetConnectionStatus,
  NetSelection,
  NetState,
  UserMessage,
} from "../utils/onlineTypes";
import {
  GameState,
  Puzzle,
  SolveHistory,
  SolveResult,
  SolveState,
} from "../utils/gameTypes";
import SolveController from "../utils/SolveController";
import {
  GameStateContext,
  NetStateContext,
  OnlineGameContext,
} from "../utils/Contexts";
import Grid from "./Grid";
import Numpad from "./Numpad";
import NetStatus from "./NetStatus";
import PuzzleController from "../utils/PuzzleMaker";
import PuzzleInfo from "./PuzzleInfo";
import Timer from "./GameTimer";
import { useHotkeys } from "react-hotkeys-hook";

/**
 * The main game mode and state. Contains the generated puzzle as well
 * as the current and all previous solve states. Uses GameWebSocket to
 * replicate changes from other clients.
 */
export default function Game({}) {
  const gameSocket = useContext(OnlineGameContext);

  /** the current puzzle to solve */
  const [puzzle, setPuzzle] = useState<Puzzle>();

  /** The global time when the puzzle solve started. */
  const [startTime, setStartTime] = useState<Date>();

  /** The global time when the puzzle was completed. */
  const [endTime, setEndTime] = useState<Date>();

  /** all current and previous solve states */
  const [history, setHistory] = useState<SolveHistory>([]);

  /** is the puzzle completed? or are there any errors? */
  const [solveResult, setSolveResult] = useState<SolveResult>(
    SolveController.emptySolveResult()
  );

  /** the current number of undos compared to the history, reset to 0 when state changes */
  const [undoDepth, setUndoDepth] = useState(0);

  /** currently selected tile */
  const [selection, setSelection] = useState<number>();

  /** current connection state */
  const [netConnectionStatus, setNetConnectionStatus] =
    useState<NetConnectionStatus>("offline");

  if (netConnectionStatus != gameSocket!.connectionStatus) {
    setNetConnectionStatus(gameSocket!.connectionStatus);
  }

  /** selection of other players online */
  const [netSelection, setNetSelection] = useState<NetSelection>(new Map());

  /** controller for working with solve states */
  const controller = puzzle
    ? new SolveController(puzzle, history, undoDepth)
    : undefined;

  const canAutoFill = history.length == 1;

  const isCompleted = solveResult.isCompleted;

  /** Track wrong attempts */
  const [wrongAttempts, setWrongAttempts] = useState(0);

  /** Track game over state */
  const [isGameOver, setIsGameOver] = useState(false);

  /** Selected difficulty */
  const [difficulty, setDifficulty] = useState("Easy");

  /** the current bundled game state for passing around */
  const gameState: GameState = {
    puzzle: puzzle,
    startTime: startTime,
    endTime: endTime,
    history: history,
    solveState: controller?.state(),
    solveResult: solveResult,
    selection: selection,
  };

  /** combined network state, for passing to other components */
  const netState: NetState = {
    status: netConnectionStatus,
    selection: Array.from(netSelection.values()),
    userSelection: netSelection,
  };

  /** Set the new solve state, adding it to the history. */
  function setSolveState(newState: SolveState) {
    // cant modify completed puzzle, only start a new one
    if (isCompleted || isGameOver) {
      return;
    }

    setHistory([...history, newState]);

    // update the solve result, aka check if the puzzle's completed!
    if (puzzle && controller) {
      var newSolveResult = controller.checkSolve(newState, puzzle);
      setSolveResult(newSolveResult);

      // record completed time
      if (newSolveResult.isCompleted) {
        setEndTime(new Date());
      }
    }
  }

  /** Called when user clicks the New puzzle button. */
  function onNewPuzzleClick() {
    if (puzzle && !confirm("Generate a new puzzle?")) {
      return;
    }

    var puzzleController = new PuzzleController();
    var newPuzzle = puzzleController.makePuzzle(difficulty);
    var newStartTime = new Date();
    setNewPuzzle(newPuzzle, newStartTime);
    setWrongAttempts(0);
    setIsGameOver(false);
    gameSocket?.send({
      type: "new-puzzle",
      puzzle: newPuzzle,
      startTimeStr: newStartTime.toISOString(),
    });
  }

  /** Called when user selects a new tile. */
  function onGridSelectionChange(tileId: number) {
    setSelection(tileId);
    gameSocket?.send({ type: "selection", selection: tileId });

    // Update selected number for highlighting
    let selectedValue = null;
    if (controller && tileId !== undefined) {
      const state = controller.state();
      if (state && state.tiles[tileId]) {
        selectedValue = state.tiles[tileId].value ?? null;
      }
    }
    setSelectedNumber(selectedValue);
  }

  /** Track selected number for highlighting */
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

  /** Called when input is given from the numpad. */
  function onNumpadInput(value: number | null, isCandidate: boolean) {
    if (selection === undefined || !controller || isGameOver) {
      return;
    }
    var newState = null;

    if (value === null) {
      // clear current value or candidates.
      // regardless of candidate mode, always clear any value first
      // so that candidates aren't cleared invisibly
      if (controller.hasValue(selection)) {
        newState = controller.clearValue(selection);
      } else if (isCandidate) {
        newState = controller.clearCandidates(selection);
      }
    } else {
      // set a new value
      if (isCandidate) {
        // don't (invisibly) update candidates if a value is set
        if (!controller.hasValue(selection)) {
          newState = controller.toggleCandidate(selection, value);
        }
      } else {
        // Check if the input is wrong
        const correctValue = puzzle?.solution[selection];
        if (value !== correctValue) {
          // Increment wrong attempts
          const newWrongAttempts = wrongAttempts + 1;
          setWrongAttempts(newWrongAttempts);
          if (newWrongAttempts >= 5) {
            setIsGameOver(true);
            alert("Game Over! You made 5 wrong attempts. Starting over.");
            onNewPuzzleClick();
            return;
          }
        }
        newState = controller.setValue(selection, value);
      }
    }

    if (newState) {
      setSolveState(newState);
      gameSocket?.send({
        type: "tile-state",
        tileId: selection,
        tileState: newState.tiles[selection],
      });
    }
  }

  /** Set the selected tile to display for another online user. */
  function setNetSelectionForUser(
    clientId: string,
    selection: number | undefined
  ) {
    let newNetSelection = new Map(netSelection);
    newNetSelection.set(clientId, selection);
    setNetSelection(newNetSelection);
  }

  /** Called when the online connection status changed. */
  gameSocket!.onConnectionStatusChange = (newStatus: NetConnectionStatus) => {
    setNetConnectionStatus(newStatus);
  };

  /** Called when receiving a message from the game websocket. */
  gameSocket!.onMessageEvent = (userMessage: UserMessage) => {
    let message = userMessage.message;
    console.log(`message: ${message.type} from ${userMessage.userId}`);

    if (message.type == "client-join") {
      // send the new client everything
      // TODO: who's the host? don't send from everyone...
      gameSocket?.send({
        type: "game-state",
        puzzle: puzzle,
        startTimeStr: startTime?.toISOString(),
        endTimeStr: endTime?.toISOString(),
        history: history,
        solveResult: solveResult,
        selection: selection,
      });
    }

    if (message.type == "client-leave") {
      // clear their tile selection
      if (netSelection?.has(userMessage.userId)) {
        let newNetSelection = new Map(netSelection);
        newNetSelection.delete(userMessage.userId);
        setNetSelection(newNetSelection);
      }
    }

    if (message.type == "new-puzzle") {
      // init game state with new puzzle
      setNewPuzzle(message.puzzle, new Date(message.startTimeStr));
    }

    if (message.type == "solve-state") {
      // receive an entire solve state
      if (message.solveState) {
        setSolveState(message.solveState);
      }
    }

    if (message.type == "game-state") {
      // receive all the new info
      setPuzzle(message.puzzle);
      setStartTime(
        message.startTimeStr ? new Date(message.startTimeStr) : undefined
      );
      setEndTime(message.endTimeStr ? new Date(message.endTimeStr) : undefined);
      setHistory(message.history);
      setSolveResult(message.solveResult);
      setNetSelectionForUser(userMessage.userId, message.selection);
    }

    if (message.type == "tile-state") {
      // force-update the tile state for the updated tile
      var newState = controller?.setTileState(
        message.tileId,
        message.tileState
      );

      // TODO: how do we ensure history states match?
      if (newState) {
        setSolveState(newState);
      }
    }

    if (message.type == "selection") {
      // store selected tile id by user id
      setNetSelectionForUser(userMessage.userId, message.selection);
    }
  };

  function setNewPuzzle(newPuzzle: Puzzle, startTime: Date) {
    setPuzzle(newPuzzle);
    setHistory([SolveController.initialState(newPuzzle)]);
    setSolveResult(SolveController.emptySolveResult());
    setStartTime(startTime);
    setEndTime(undefined);
  }

  function autoFillCandidates() {
    if (controller) {
      var newState = controller.autoFillCandidates();
      if (newState) {
        setSolveState(newState);
        // send the new full solve state
        gameSocket?.send({
          type: "solve-state",
          solveState: newState,
        });
      }
    }
  }

  useHotkeys("shift+n", () => onNewPuzzleClick());

  return (
    <NetStateContext.Provider value={netState}>
      <GameStateContext.Provider value={gameState}>
        <div className={`su-game play-area ${isCompleted ? "completed" : ""}`}>
          <div className="play-area">
            <div className="columns wrap">
              <div className="column box">
                <div className="box flex">
                  <div className="difficulty-bar">
                    Difficulty:&nbsp;
                    {["Easy", "Medium", "Hard", "Expert", "Master", "Extreme"].map(
                      (level) => (
                        <span
                          key={level}
                          className={`difficulty-level ${
                            difficulty === level ? "selected" : ""
                          }`}
                          onClick={() => setDifficulty(level)}
                        >
                          {level}
                        </span>
                      )
                    )}
                  </div>
                  <button
                    className={`btn ${puzzle ? "" : "info"}`}
                    onClick={onNewPuzzleClick}
                  >
                    New
                  </button>
                  {/* Removed Auto button as per request */}
                  {/* {canAutoFill ? (
                    <button className="btn" onClick={autoFillCandidates}>
                      Auto
                    </button>
                  ) : (
                    <></>
                  )} */}
                  {/* Removed duplicate NetStatus here */}
                  {/* <span className="align-right">
                    <NetStatus />
                  </span> */}
                </div>
          {isGameOver && (
            <div className="game-over-message" role="alert" aria-live="assertive">
              Game Over! You made 5 wrong attempts. Starting over.
            </div>
          )}
              <Grid onSelectionChange={onGridSelectionChange} selectedNumber={selectedNumber} />
              </div>
              <div className="column box centered">
                <div style={{ marginBottom: "0.5em" }}>
                  <span style={{ fontSize: "0.8em", color: "#c00", fontWeight: "bold", display: "block", marginBottom: "0.2em" }}>
                    Mistakes: {wrongAttempts} / 5
                  </span>
                  <span className="puzzle-info text-lg" style={{ marginRight: "0.5em" }}>
                    <PuzzleInfo />
                  </span>
                  <span style={{ fontSize: "0.8em", color: "#666" }}>
                    <NetStatus />
                  </span>
                </div>
                <Numpad onInput={onNumpadInput} />
              </div>
            </div>
          </div>
        </div>
      </GameStateContext.Provider>
    </NetStateContext.Provider>
  );
}

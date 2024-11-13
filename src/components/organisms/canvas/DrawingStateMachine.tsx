import { useCallback, useEffect, useState } from "react"
import { distance, type Coordinates } from "../../../sketchElements/coordinates"
import { useAppSelector } from "../../../app/hooks"
import type { ActiveTool } from "../../templates/sketcher/sketcherSlice"
import {
  DrawingTool,
  selectActiveTool,
  selectASingleCurve,
  unselectCurvesAndCreationTool,
} from "../../templates/sketcher/sketcherSlice"
import type { CurveData } from "../../../sketchElements/curveTypes"
import { CurveOperations } from "../../../sketchElements/curveOperations"

// State Machine State
enum ActionType {
  Idle,
  PotentialDraw,
  Drawing,
  MovingCurves,
  MovingControlPoint,
}

// Sate Machine Event
enum CanvasEvent {
  PressDown,
  Move,
  PressRelease,
}

const SMALL_MOVE_THRESHOLD = 5 // Pixels

/**
 * The DrawingStateMachine class manages the state transitions and actions
 * based on canvas events. It uses the state machine design pattern to handle
 * different states and events.
 */
class DrawingStateMachine {
  private state: ActionType = ActionType.Idle
  private context: DrawingStateMachineContext
  private initialPressPosition: Coordinates | null = null
  private selectedCurveId: string | null

  constructor(initialContext: any) {
    this.context = initialContext
    this.selectedCurveId = null
  }

  public transition(event: CanvasEvent, payload: any): void {
    switch (this.state) {
      case ActionType.Idle:
        this.handleIdleState(event, payload)
        break
      case ActionType.PotentialDraw:
        this.handlePotentialDrawState(event, payload)
        break
      case ActionType.Drawing:
        this.handleDrawingState(event, payload)
        break
      case ActionType.MovingCurves:
        this.handleMovingCurvesState(event, payload)
        break
      case ActionType.MovingControlPoint:
        this.handleMovingControlPointState(event, payload)
        break
    }
  }

  private handleIdleState(
    event: CanvasEvent,
    payload: { coordinates: Coordinates; activeTool: ActiveTool },
  ): void {
    if (event === CanvasEvent.PressDown) {
      const { coordinates, activeTool } = payload
      this.initialPressPosition = coordinates
      if (activeTool in DrawingTool) {
        this.state = ActionType.PotentialDraw
      } else if (this.context.getControlPointAtPosition(coordinates)) {
        this.state = ActionType.MovingControlPoint
        this.context.startMovingControlPoint(coordinates)
      } else if (this.context.getCurveAtPosition(coordinates)) {
        this.state = ActionType.MovingCurves
        this.context.startMovingCurves(coordinates)
      }
    }
  }

  private handlePotentialDrawState(
    event: CanvasEvent,
    payload: { coordinates: Coordinates; activeTool: ActiveTool },
  ): void {
    const { coordinates, activeTool } = payload
    if (event === CanvasEvent.Move) {
      if (
        this.initialPressPosition &&
        !this.isSmallMove(this.initialPressPosition, coordinates)
      ) {
        this.state = ActionType.Drawing
        this.context.startDrawing(this.initialPressPosition, activeTool)
        this.context.continueDrawing(coordinates)
      }
    } else if (event === CanvasEvent.PressRelease) {
      this.context.unselectDrawingTool()
      this.state = ActionType.Idle
      this.initialPressPosition = null
    }
  }

  private handleDrawingState(event: CanvasEvent, payload: any): void {
    if (event === CanvasEvent.Move) {
      this.context.continueDrawing(payload.coordinates)
    } else if (event === CanvasEvent.PressRelease) {
      this.context.finishDrawing(payload.coordinates)
      this.state = ActionType.Idle
      this.initialPressPosition = null
    }
  }

  private handleMovingCurvesState(event: CanvasEvent, payload: any): void {
    if (event === CanvasEvent.Move) {
      this.context.moveCurves(payload.coordinates)
    } else if (event === CanvasEvent.PressRelease) {
      this.context.finishMovingCurves(payload.coordinates)
      this.state = ActionType.Idle
    }
  }

  private handleMovingControlPointState(
    event: CanvasEvent,
    payload: any,
  ): void {
    if (event === CanvasEvent.Move) {
      this.context.moveControlPoint(payload.coordinates)
    } else if (event === CanvasEvent.PressRelease) {
      this.context.finishMovingControlPoint(payload.coordinates)
      this.checkAndCloseCurve()
      this.state = ActionType.Idle
    }
  }

  private checkAndCloseCurve(): void {
    const currentCurve = this.context.getCurrentCurve()
    if (currentCurve) {
      const firstPoint = CurveOperations.getFirstPoint(currentCurve)
      const lastPoint = CurveOperations.getLastPoint(currentCurve)
      if (this.arePointsClose(firstPoint, lastPoint)) {
        this.context.closeCurve(currentCurve)
      }
    }
  }

  private arePointsClose(point1: Coordinates, point2: Coordinates): boolean {
    return distance(point1, point2) <= this.context.CLOSE_CURVE_THRESHOLD
  }

  private isSmallMove(start: Coordinates, end: Coordinates): boolean {
    return distance(start, end) <= SMALL_MOVE_THRESHOLD
  }
}

// Define the drawing state machine context type
type DrawingStateMachineContext = {
  getCurrentCurve(): CurveData
  startDrawing: (coordinates: Coordinates, tool: string) => void
  continueDrawing: (coordinates: Coordinates) => void
  finishDrawing: (coordinates: Coordinates) => void
  unselectDrawingTool: () => void
  startMovingCurves: (coordinates: Coordinates) => void
  moveCurves: (coordinates: Coordinates) => void
  finishMovingCurves: (coordinates: Coordinates) => void
  startMovingControlPoint: (coordinates: Coordinates) => void
  moveControlPoint: (coordinates: Coordinates) => void
  finishMovingControlPoint: (coordinates: Coordinates) => void
  getCurveAtPosition: (coordinates: Coordinates) => CurveData | null
  getControlPointAtPosition: (coordinates: Coordinates) => any
  closeCurve: (curve: any) => void
  CLOSE_CURVE_THRESHOLD: number
}

export const DrawingComponent: React.FC = () => {
  const activeTool = useAppSelector(selectActiveTool)
  const [stateMachine, setStateMachine] = useState<DrawingStateMachine | null>(
    null,
  )

  useEffect(() => {
    const context: DrawingStateMachineContext = {
      startDrawing: (coordinates: Coordinates, tool: string) => {
        // Implementation
      },
      continueDrawing: (coordinates: Coordinates) => {
        // Implementation
      },
      finishDrawing: (coordinates: Coordinates) => {
        // Implementation
      },
      unselectDrawingTool: () => {
        dispatch(unselectCurvesAndCreationTool())
      },
      startMovingCurves: (coordinates: Coordinates) => {
        dispatch(selectASingleCurve({ curveID: curve.id }))
      },
      moveCurves: (coordinates: Coordinates) => {
        // Implementation
      },
      finishMovingCurves: (coordinates: Coordinates) => {
        // Implementation
      },
      startMovingControlPoint: (coordinates: Coordinates) => {
        // Implementation
      },
      moveControlPoint: (coordinates: Coordinates) => {
        // Implementation
      },
      finishMovingControlPoint: (coordinates: Coordinates) => {
        // Implementation
      },
      getCurveAtPosition: (coordinates: Coordinates) => {
        // Implementation
      },
      getControlPointAtPosition: (coordinates: Coordinates) => {
        // Implementation
      },
      closeCurve: (curve: any) => {
        // Implementation to close the curve
        // This might involve adding a final segment to connect the first and last points
        // and potentially dispatching an action to update the curve in your state
      },
      CLOSE_CURVE_THRESHOLD: 10,
      getCurrentCurve: function (): CurveData {
        throw new Error("Function not implemented.")
      },
    }

    setStateMachine(new DrawingStateMachine(context))
  }, [])

  const handlePressDown = useCallback(
    (event: React.MouseEvent) => {
      const coordinates = { x: event.clientX, y: event.clientY }
      stateMachine?.transition(CanvasEvent.PressDown, {
        coordinates,
        activeTool,
      })
    },
    [activeTool, stateMachine],
  )

  const handleMove = useCallback(
    (event: React.MouseEvent) => {
      const coordinates = { x: event.clientX, y: event.clientY }
      stateMachine?.transition(CanvasEvent.Move, { coordinates })
    },
    [stateMachine],
  )

  const handlePressRelease = useCallback(
    (event: React.MouseEvent) => {
      const coordinates = { x: event.clientX, y: event.clientY }
      stateMachine?.transition(CanvasEvent.PressRelease, { coordinates })
    },
    [stateMachine],
  )

  return (
    <div
      onMouseDown={handlePressDown}
      onMouseMove={handleMove}
      onMouseUp={handlePressRelease}
    >
      {/* Your drawing component JSX */}
    </div>
  )
}
function dispatch(arg0: {
  payload: undefined
  type: "sketcher/unselectCurvesAndCreationTool"
}) {
  throw new Error("Function not implemented.")
}

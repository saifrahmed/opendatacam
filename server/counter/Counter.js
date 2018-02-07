const Tracker = require('node-tracker-by-detections').Tracker;
const isInsideSomeAreas = require('./utils').isInsideSomeAreas;
const cloneDeep = require('lodash.clonedeep');


const initialState = {
  timeLastFrame: new Date(),
  currentFrame: 0,
  countedItemsHistory: [],
  counterDashboard: {},
  image: {
    w: 1280,
    h: 720
  },
  countingAreas: {}
}

let Counter = cloneDeep(initialState);

module.exports = {

  reset: function() {
    // Reset counter
    Counter = cloneDeep(initialState);
    // Reset tracker
    Tracker.reset();
  },

  /*
    Example countingAreas

    { 
      yellow: { point1: { x1: 35.05624790519486, y1: 69.33333587646484 }, point2: { x2: 111.38124638170021, y2: 27.11111068725586 } },
      turquoise: null 
    }
  */
  registerCountingAreas : function(countingAreas) {
    Object.keys(countingAreas).map((countingAreaKey) => {
      if(countingAreas[countingAreaKey]) {
        this.registerSingleCountingArea(countingAreaKey, countingAreas[countingAreaKey]);
      }
    })
  },

  registerSingleCountingArea(key, data) {

    // Remap coordinates to image reference size
    // The editor canvas can be smaller / bigger
    let resizedData = {
      point1: {
        x1: data.point1.x1 * Counter.image.w / data.refWidth,
        y1: data.point1.y1 * Counter.image.h / data.refHeight,
      },
      point2: {
        x2: data.point2.x2 * Counter.image.w / data.refWidth,
        y2: data.point2.y2 * Counter.image.h / data.refHeight,
      }
    }

    // Determine the linear function for this counting area
    // Y = aX + b
    // -> a = dY / dX
    // -> b = Y1 - aX1
    // NOTE: We need to invert the Y coordinates to be in a classic Cartesian coordinate system
    // The coordinates in inputs are from the canvas coordinates system 

    let { point1, point2 } = resizedData;

    let a = (- point2.y2 + point1.y1) / (point2.x2 - point1.x1);
    let b = - point1.y1 - a * point1.x1;
    // Store xBounds to determine if the point is "intersecting" the line on the drawn part
    let xBounds = {
      xMin: Math.min(point1.x1, point2.x2),
      xMax: Math.max(point1.x1, point2.x2)
    }

    Counter.countingAreas[key] = {
      a: a,
      b: b,
      xBounds: xBounds
    }

    console.log(Counter.countingAreas);

  },

  countItem: function(trackedItem, countingAreaKey) {
    // Add it to the history (for export feature)
    Counter.countedItemsHistory.push({
      date: new Date().toLocaleDateString(),
      area: countingAreaKey,
      type: trackedItem.name,
      id: trackedItem.idDisplay
    })

    // Increment the counterDashboard 
    if(Counter.counterDashboard[trackedItem.name]) {
      Counter.counterDashboard[trackedItem.name]++;
    } else {
      Counter.counterDashboard[trackedItem.name] = 1;
    }
  },

  updateWithNewFrame: function(detectionsOfThisFrame) {

    // Compute FPS
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - Counter.timeLastFrame.getTime());
    Counter.timeLastFrame = now;
    console.log(`YOLO detections FPS: ${1000 / timeDiff}`);

    // Scale detection
    const detectionScaledOfThisFrame = detectionsOfThisFrame.map((detection) => {
      return {
        name: detection.class,
        x: detection.x * Counter.image.w,
        y: detection.y * Counter.image.h,
        w: detection.w * Counter.image.w,
        h: detection.h * Counter.image.h
      };
    });


    console.log(`Received Detection:`);
    console.log('=========');
    console.log(JSON.stringify(detectionScaledOfThisFrame));
    console.log('=========');
    console.log('Update tracker with this frame')
    console.log(`Frame id: ${Counter.currentFrame}`);
    console.log('=========')

    Tracker.updateTrackedItemsWithNewFrame(detectionScaledOfThisFrame, Counter.currentFrame);

    let trackerDataForThisFrame = Tracker.getJSONOfTrackedItems();

    // Compute deltaYs for all tracked items (between the counting lines and the tracked items position)
    // And check if trackedItem are going through some counting areas 
    // For each new tracked item
    trackerDataForThisFrame = trackerDataForThisFrame.map((trackedItem) => {
      // For each counting areas
      var countingDeltas = Object.keys(Counter.countingAreas).map((countingAreaKey) => {
        let countingAreaProps = Counter.countingAreas[countingAreaKey] 
        // NB: negating Y detection to get it in "normal" coordinates space
        // deltaY = - Y(detection) - a X(detection) + b
        let deltaY = - trackedItem.y - countingAreaProps.a * trackedItem.x + countingAreaProps.b;

        // If trackerDataForLastFrame exists, we can if we items are passing through the counting line
        if(this.trackerDataForLastFrame) {
          // Find trackerItem data of last frame
          let trackerItemLastFrame = this.trackerDataForLastFrame.find((itemLastFrame) => itemLastFrame.id === trackedItem.id)
          let lastDeltaY = trackerItemLastFrame.countingDeltas[countingAreaKey]

          if(Math.sign(lastDeltaY) !== Math.sign(deltaY)) {
            // Tracked item has cross the {countingAreaKey} counting line
            // Count it
            this.countItem(trackedItem, countingAreaKey);
          }
        }

        return {
          countingAreaKey: countingAreaKey,
          deltaY: deltaY
        }

      });

      // Convert counting delta to a map
      var countingDeltaMap = {}
      
      countingDeltas.map((countingDelta) => {
        countingDeltaMap[countingDelta.countingAreaKey] = countingDelta.deltaY
      })

      return {
        ...trackedItem,
        countingDeltas: countingDeltaMap
      }
    })

    console.log('Tracker data');
    console.log('=========')
    console.log(JSON.stringify(trackerDataForThisFrame));
    console.log('=========')

    // Increment frame number
    Counter.currentFrame++;

    // Remember trackerData for last frame
    this.trackerDataForLastFrame = trackerDataForThisFrame;
  },

  getCountingData: function() {
    return Counter.counterDashboard;
  }
}

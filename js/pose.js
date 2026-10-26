// 鏡頭與 MediaPipe 偵測（全部在本機瀏覽器執行，影像不上傳）
// kind = 'pose'：全身 33 個骨架點；kind = 'hand'：手部 21 個點
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};

  const MP_VERSION = '0.10.14';
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION;
  const MODELS = {
    pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
  };

  let filesetPromise = null;
  const landmarkers = {};

  function fileset() {
    if (!filesetPromise) {
      filesetPromise = (async () => {
        const vision = await import(MP_BASE + '/vision_bundle.mjs');
        return { vision, files: await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm') };
      })();
      filesetPromise.catch(() => { filesetPromise = null; });
    }
    return filesetPromise;
  }

  // 模型只載入一次，再玩一次時直接沿用（'hand2' 兩隻手也用手部模型）
  function loadLandmarker(kind) {
    kind = kind === 'pose' || !kind ? 'pose' : 'hand';
    if (!landmarkers[kind]) {
      landmarkers[kind] = (async () => {
        const { vision, files } = await fileset();
        const Task = kind === 'hand' ? vision.HandLandmarker : vision.PoseLandmarker;
        const options = delegate => Object.assign(
          { baseOptions: { modelAssetPath: MODELS[kind], delegate }, runningMode: 'VIDEO' },
          kind === 'hand'
            ? { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }
            : { numPoses: 2, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 }
        );
        try {
          return await Task.createFromOptions(files, options('GPU'));
        } catch (e) {
          return await Task.createFromOptions(files, options('CPU'));
        }
      })();
      landmarkers[kind].catch(() => { delete landmarkers[kind]; });
    }
    return landmarkers[kind];
  }

  class CameraPose {
    constructor(video) {
      this.isDemo = false;
      this.video = video;
      this.kind = 'pose';
      this.landmarker = null;
      this.stream = null;
      this.lastVideoTime = -1;
      this.last = null;
      this.width = 1280;
      this.height = 720;
      this.probe = null;
      this.prefer = 'R';   // 手部模式：要追蹤哪一隻手
    }

    async load(kind) {
      this.kind = kind || 'pose';
      this.last = null;
      this.lastVideoTime = -1;
      this.landmarker = await loadLandmarker(this.kind);
    }

    async startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const err = new Error('這個瀏覽器不支援鏡頭');
        err.name = 'NotSupportedError';
        throw err;
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.width = this.video.videoWidth || 1280;
      this.height = this.video.videoHeight || 720;
    }

    stopCamera() {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.video.srcObject = null;
      this.last = null;
      this.lastVideoTime = -1;
    }

    // 回傳畫面座標（像素、已左右翻轉成鏡子效果）的骨架點
    read(nowMs) {
      const v = this.video;
      if (!this.landmarker || v.readyState < 2) return this.last;
      if (v.currentTime === this.lastVideoTime) return this.last;
      this.lastVideoTime = v.currentTime;
      this.width = v.videoWidth || this.width;
      this.height = v.videoHeight || this.height;

      const res = this.landmarker.detectForVideo(v, nowMs);
      const list = (res && res.landmarks) || [];
      if (!list.length) { this.last = null; return null; }
      const w = this.width, h = this.height;
      const toScreen = pts => {
        // 部分版本沒有提供可見度，視為全部可見
        const noVis = pts.every(q => !q.visibility);
        return pts.map(q => ({ x: (1 - q.x) * w, y: q.y * h, visibility: noVis ? 1 : q.visibility }));
      };
      if (this.kind === 'hand2') {
        // 兩隻手都要看到；依畫面左右排序：前 21 點是左手、後 21 點是右手（鏡像畫面）
        if (list.length < 2) { this.last = null; return null; }
        const hands = list.slice(0, 2).map(toScreen).sort((a, b) => a[0].x - b[0].x);
        this.last = hands[0].concat(hands[1]);
        return this.last;
      }
      const best = this.kind === 'hand' ? this.pickHand(list, res.handedness || []) : this.pickPose(list);
      this.last = toScreen(best);
      return this.last;
    }

    // 畫面有多人時，選身體最大（通常是最靠近鏡頭）的那位
    pickPose(poses) {
      let best = poses[0], bestSize = -1;
      for (const p of poses) {
        const ys = p.filter(q => (q.visibility == null ? 1 : q.visibility) > 0.5).map(q => q.y);
        const size = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
        if (size > bestSize) { bestSize = size; best = p; }
      }
      return best;
    }

    // 只看到一隻手就用那隻；兩隻都在時選要求的那隻。
    // MediaPipe 假設畫面已鏡像，我們送進去的是原始畫面，所以 'Left' 其實是長輩的右手。
    pickHand(hands, handedness) {
      if (hands.length === 1) return hands[0];
      const want = this.prefer === 'R' ? 'Left' : 'Right';
      const i = handedness.findIndex(h => h && h[0] && h[0].categoryName === want);
      return hands[i >= 0 ? i : 0];
    }

    // 平均亮度 0–255，用來判斷光線是否足夠
    brightness() {
      const v = this.video;
      if (v.readyState < 2) return 0;
      if (!this.probe) {
        this.probe = document.createElement('canvas');
        this.probe.width = 32;
        this.probe.height = 18;
      }
      const ctx = this.probe.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return sum / (d.length / 4);
    }
  }

  RCDD.CameraPose = CameraPose;
  RCDD.preloadPose = () => loadLandmarker('pose');
})(window);

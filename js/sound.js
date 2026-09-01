/* 손맛 — 사운드 훅 (지금은 무음, 추후 Web Audio API로 채울 자리) */

const Sound = {
  enabled: false,

  /**
   * @param {'ambient'|'bite'|'reel'|'catch'|'ui'} name
   */
  play(name) {
    if (!this.enabled) return;
    // TODO: Web Audio API 또는 <audio> 태그로 실제 사운드 연결
  },

  stop(name) {
    if (!this.enabled) return;
    // TODO
  }
};

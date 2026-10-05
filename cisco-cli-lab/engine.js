(function (root, factory) {
  const Engine = factory();
  if (typeof module === "object" && module.exports) module.exports = Engine;
  else root.CiscoCliEngine = Engine;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const encryptType7 = (value, seed = 2) => {
    const key = "dsfd;kfoA,.iyewrkldJKDHSUB";
    let out = String(seed).padStart(2, "0");
    for (let i = 0; i < value.length; i++) {
      out += (value.charCodeAt(i) ^ key.charCodeAt((seed + i) % key.length)).toString(16).toUpperCase().padStart(2, "0");
    }
    return out;
  };

  class CiscoCliEngine {
    constructor(deviceType = "router") { this.reset(deviceType); }

    reset(deviceType = this.deviceType || "router") {
      this.deviceType = deviceType === "switch" ? "switch" : "router";
      this.defaultHostname = this.deviceType === "switch" ? "Switch" : "Router";
      this.hostname = this.defaultHostname;
      this.mode = "user";
      this.lineContext = null;
      this.enableSecret = null;
      this.passwordEncryption = false;
      this.console = { password: null, login: false };
      this.vty = { start: 0, end: 4, password: null, login: false };
      this.history = [];
      this.historyIndex = 0;
      return this;
    }

    prompt() {
      if (this.mode === "user") return `${this.hostname}>`;
      if (this.mode === "privileged") return `${this.hostname}#`;
      if (this.mode === "config") return `${this.hostname}(config)#`;
      return `${this.hostname}(config-line)#`;
    }

    execute(raw) {
      const input = String(raw || "").trim();
      if (!input) return { output: "", prompt: this.prompt() };
      this.history.push(input);
      this.historyIndex = this.history.length;
      const lower = input.toLowerCase().replace(/\s+/g, " ");
      let output = "";

      if (lower === "?" || lower.endsWith(" ?")) {
        output = "% Context-sensitive help is disabled in this practice lab.";
      } else if (this.mode === "user") {
        if (this.matches(input, ["enable"])) this.mode = "privileged";
        else if (this.matches(input, ["exit"]) || this.matches(input, ["logout"])) output = "\nConsole session remains available for this lab.";
        else output = this.commandError(input);
      } else if (this.mode === "privileged") {
        if (this.matches(input, ["disable"])) this.mode = "user";
        else if (this.matches(input, ["configure", "terminal"])) {
          this.mode = "config";
          output = "Enter configuration commands, one per line.  End with CNTL/Z.";
        } else if (this.matches(input, ["show", "running-config"])) output = this.runningConfig();
        else if (this.matches(input, ["copy", "running-config", "startup-config"]) || this.matches(input, ["write", "memory"]) || lower === "wr") output = "Building configuration...\n[OK]";
        else if (this.matches(input, ["exit"]) || this.matches(input, ["logout"])) this.mode = "user";
        else output = this.commandError(input);
      } else if (this.mode === "config") {
        const words = this.words(input);
        if (this.matches(input, ["hostname", "<arg>"]) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(words[1])) this.hostname = words[1];
        else if (this.matches(input, ["no", "hostname"])) this.hostname = this.defaultHostname;
        else if (this.matches(input, ["enable", "secret", "<arg>"])) this.enableSecret = words[2];
        else if (this.matches(input, ["no", "enable", "secret"])) this.enableSecret = null;
        else if (this.matches(input, ["service", "password-encryption"])) this.passwordEncryption = true;
        else if (this.matches(input, ["no", "service", "password-encryption"])) this.passwordEncryption = false;
        else if (this.matches(input, ["line", "console", "0"])) { this.mode = "line"; this.lineContext = "console"; }
        else if (this.matches(input, ["line", "vty", "<num>", "<num>"])) {
          this.vty.start = Number(words[2]); this.vty.end = Number(words[3]); this.mode = "line"; this.lineContext = "vty";
        } else if (this.matches(input, ["end"])) this.mode = "privileged";
        else if (this.matches(input, ["exit"])) this.mode = "privileged";
        else if (/^(show|sh) (running-config|run)$/i.test(input)) output = "% Invalid input detected at '^' marker.\n% Use an EXEC-mode command from this configuration level.";
        else output = this.commandError(input);
      } else if (this.mode === "line") {
        const words = this.words(input);
        const target = this.lineContext === "console" ? this.console : this.vty;
        if (this.matches(input, ["line", "console", "0"])) {
          this.lineContext = "console";
        } else if (this.matches(input, ["line", "vty", "<num>", "<num>"])) {
          this.vty.start = Number(words[2]);
          this.vty.end = Number(words[3]);
          this.lineContext = "vty";
        } else if (this.matches(input, ["password", "<arg>"])) target.password = words[1];
        else if (this.matches(input, ["no", "password"])) target.password = null;
        else if (this.matches(input, ["login"])) target.login = true;
        else if (this.matches(input, ["no", "login"])) target.login = false;
        else if (this.matches(input, ["exit"])) { this.mode = "config"; this.lineContext = null; }
        else if (this.matches(input, ["end"])) { this.mode = "privileged"; this.lineContext = null; }
        else output = this.commandError(input);
      }
      return { output, prompt: this.prompt() };
    }

    is(value, ...options) { return options.includes(value); }
    words(input) { return String(input).trim().match(/\S+/g) || []; }
    matches(input, syntax) {
      const words = this.words(input);
      if (words.length !== syntax.length) return false;
      return syntax.every((expected, index) => {
        const actual = words[index];
        if (expected === "<arg>") return actual.length > 0;
        if (expected === "<num>") return /^\d+$/.test(actual);
        return expected.toLowerCase().startsWith(actual.toLowerCase());
      });
    }
    commandError(input) {
      return this.isIncomplete(input) ? "% Incomplete command." : this.invalid(input);
    }
    isIncomplete(input) {
      const words = this.words(input).map(word => word.toLowerCase());
      if (!words.length) return false;
      return this.syntaxForMode().some(syntax => {
        if (words.length >= syntax.length) return false;
        return words.every((actual, index) => {
          const expected = syntax[index];
          if (expected === "<arg>") return actual.length > 0;
          if (expected === "<num>") return /^\d+$/.test(actual);
          return expected.startsWith(actual);
        });
      });
    }
    invalid(input) {
      const commandIndex = this.errorIndex(input);
      const caretColumn = this.prompt().length + 1 + commandIndex;
      return `${" ".repeat(caretColumn)}^\n% Invalid input detected at '^' marker.`;
    }

    errorIndex(input) {
      return this.compareSyntaxForCaret(input, this.syntaxForMode());
    }

    syntaxForMode() {
      const ARG = "<arg>";
      const NUM = "<num>";
      return ({
        user: [["enable"], ["exit"], ["logout"]],
        privileged: [
          ["disable"], ["configure", "terminal"], ["show", "running-config"],
          ["copy", "running-config", "startup-config"], ["write", "memory"], ["exit"], ["logout"]
        ],
        config: [
          ["hostname", ARG], ["no", "hostname"], ["enable", "secret", ARG], ["no", "enable", "secret"],
          ["service", "password-encryption"], ["no", "service", "password-encryption"],
          ["line", "console", "0"], ["line", "vty", NUM, NUM], ["end"], ["exit"]
        ],
        line: [
          ["password", ARG], ["no", "password"], ["login"], ["no", "login"],
          ["line", "console", "0"], ["line", "vty", NUM, NUM], ["end"], ["exit"]
        ]
      }[this.mode] || []);
    }

    compareSyntaxForCaret(input, candidates) {
      const ARG = "<arg>";
      const NUM = "<num>";
      const tokens = [];
      const matcher = /\S+/g;
      let match;
      while ((match = matcher.exec(input))) tokens.push({ value: match[0].toLowerCase(), start: match.index });
      let bestProgress = -1;
      let bestIndex = 0;
      for (const syntax of candidates) {
        let progress = 0;
        let mismatchIndex = input.length;
        let failed = false;
        const count = Math.min(tokens.length, syntax.length);
        for (let i = 0; i < count; i++) {
          const expected = syntax[i];
          const actual = tokens[i].value;
          if (expected === ARG || (expected === NUM && /^\d+$/.test(actual))) {
            progress = tokens[i].start + actual.length;
            continue;
          }
          if (expected !== NUM && expected.startsWith(actual)) {
            progress = tokens[i].start + actual.length;
            continue;
          }

          let common = 0;
          if (expected !== NUM) {
            while (common < actual.length && common < expected.length && actual[common] === expected[common]) common++;
          }
          mismatchIndex = tokens[i].start + common;
          progress = mismatchIndex;
          failed = true;
          break;
        }
        if (!failed && count === syntax.length && tokens.length > syntax.length) {
          mismatchIndex = tokens[syntax.length].start;
          progress = mismatchIndex;
        }
        if (progress > bestProgress || (progress === bestProgress && mismatchIndex > bestIndex)) {
          bestProgress = progress;
          bestIndex = mismatchIndex;
        }
      }
      return bestIndex;
    }

    runningConfig() {
      const lines = [
        "Building configuration...", "", "Current configuration : 782 bytes", "!", "version 15.1", "no service timestamps log datetime msec", "no service timestamps debug datetime msec",
        this.passwordEncryption ? "service password-encryption" : "no service password-encryption", "!", `hostname ${this.hostname}`, "!"
      ];
      if (this.enableSecret) lines.push(`enable secret 5 $1$mERr$${this.fakeHash(this.enableSecret)}`, "!");
      if (this.deviceType === "router") lines.push("interface GigabitEthernet0/0", " no ip address", " shutdown", " duplex auto", " speed auto", "!");
      else lines.push("interface FastEthernet0/1", " switchport access vlan 1", "!");
      lines.push("line con 0");
      if (this.console.password) lines.push(` password ${this.displayPassword(this.console.password)}`);
      if (this.console.login) lines.push(" login");
      lines.push("!", `line vty ${this.vty.start} ${this.vty.end}`);
      if (this.vty.password) lines.push(` password ${this.displayPassword(this.vty.password)}`);
      if (this.vty.login) lines.push(" login");
      lines.push("!", "end");
      return lines.join("\n");
    }

    displayPassword(password) { return this.passwordEncryption ? `7 ${encryptType7(password)}` : password; }
    fakeHash(value) {
      let hash = 2166136261;
      for (const c of value) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
      return hash.toString(36).padEnd(22, "A").slice(0, 22);
    }

    grade() {
      const checks = [
        [this.hostname === "EDGE-1", "Hostname"],
        [this.enableSecret === "Cisco123!", "Enable secret"],
        [this.console.password === "ConPass1" && this.console.login, "Console protection"],
        [this.vty.start === 0 && this.vty.end >= 4 && this.vty.password === "VtyPass1" && this.vty.login, "VTY protection"],
        [this.passwordEncryption, "Password encryption"]
      ];
      return { passed: checks.filter(([ok]) => ok).length, total: checks.length, checks: checks.map(([ok, name]) => ({ ok, name })) };
    }
  }
  return CiscoCliEngine;
});

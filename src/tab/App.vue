<template>
  <div id="app">
    <div v-if="!isDobSet">
      <form>
        <h1 id="dob" class="age-label">When were you born?</h1>
        <footer>
          <input v-model="dob" type="date" name="dob" id="dob" />
          <button @click.prevent="save">Start</button>
        </footer>
      </form>
    </div>
    <div v-else>
      <h1 class="age-label">AGE</h1>
      <h2 class="count">
        <span>{{ year }}</span>
        <sup>.{{ milliseconds }}</sup>
      </h2>
    </div>
  </div>
</template>

<script>
export default {
  name: "App",
  methods: {
    save: function () {
      localStorage.dob = this.dob;
      this.isDobSet = true;
      this.renderAge();
    },
    renderAge: function () {
      const now = new Date();
      const duration = now - new Date(this.dob);
      const years = duration / 31556900000;
      const majorMinor = years.toFixed(9).toString().split(".");

      this.year = majorMinor[0];
      this.milliseconds = majorMinor[1];

      setTimeout(this.renderAge, 100);
    },
  },
  mounted: function () {
    if (localStorage.dob) {
      this.dob = localStorage.dob;
      this.isDobSet = true;
      this.renderAge();
    }
  },
  data() {
    return {
      dob: "",
      isDobSet: false,
      year: 0,
      milliseconds: 0,
    };
  },
};
</script>

<style>
*,
*:before,
*:after {
  box-sizing: border-box;
}

body,
html {
  margin: 0;
  padding: 0;
  height: 100%;
  background-color: #ffffff;
}

@media (prefers-color-scheme: dark) {
  body,
  html {
    background-color: #222222;
  }
}

body {
  /* -moz-osx-font-smoothing: grayscale; */
  align-items: center;
  flex-direction: column;
  /* -webkit-font-smoothing: antialiased; */
  justify-content: center;
}

body,
input {
  display: -webkit-flex;
  font-family: "Avenir", "helvetica neue", helvetica, arial, sans-serif;
}

.age-label {
  color: #b0b5b9;
  font-size: 1.2rem;
  line-height: 1;
  margin: 0 0 0 2px;
}

@media (prefers-color-scheme: dark) {
  .age-label {
    color: #494949;
  }
}

.count {
  color: #494949;
  margin: 0;
  font-size: 6rem;
  line-height: 1;
  font-weight: 600;
}

@media (prefers-color-scheme: dark) {
  .count {
    color: #b0b5b9;
  }
}

.count sup {
  font-size: 2.4rem;
  margin-left: -20px;
}

label {
  display: block;
}

input,
button {
  padding: 0.375rem 0.75rem;
  font-size: 1.5rem;
  appearance: none;
}

input {
  margin-right: 0.5rem;
  box-sizing: border-box;
  border-width: 1px;
  border-style: solid;
  border-radius: 0.25rem;
  border-color: #ccc;
  background-color: #fff;
}

button {
  outline: none;
  display: block;
  cursor: pointer;
  color: #fff;
  border: none;
  border-radius: 0.25rem;
  background-color: #0be;
}

footer {
  padding-top: 0.5rem;
  display: -webkit-flex;
  flex-direction: row;
  justify-content: center;
}
</style>

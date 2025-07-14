import commonjs from '@rollup/plugin-commonjs';
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default [{
	input: "./ts/index.ts",
	output: [{
		file: "./index.js",
		format: "iife",
	}],
	plugins: [
		typescript(),
		resolve(),
		commonjs(),
	],
}, {
	input: "./ts/edit.ts",
	output: [{
		file: "./edit.js",
		format: "iife",
	}],
	plugins: [
		typescript(),
		resolve(),
		commonjs(),
	],
},];

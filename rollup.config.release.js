import commonjs from '@rollup/plugin-commonjs';
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default [{
	input: "./ts/index.ts",
	output: [{
		file: "./script.js",
		format: "iife",
	}],
	plugins: [
		typescript(),
		resolve(),
		commonjs(),
		terser({
			format: {
				preamble: "// Copyright (c) 2025 Sadret",
			},
		}),
	],
},];

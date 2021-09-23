module.exports = {
	root: true,
	env: {
		node: true
	},
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: "./tsconfig.json"
		// sourceType: "module",
		// ecmaVersion: 2018
	},
	plugins: [
		"@typescript-eslint"
	],
	extends: [
		"plugin:@typescript-eslint/recommended-requiring-type-checking"
	],
	rules: {
		"brace-style": [
			2,
			"1tbs"
		],
		"comma-dangle": [
			2,
			"never"
		],
		"comma-spacing": [
			2,
			{
				"before": false,
				"after": true
			}
		],
		"computed-property-spacing": [
			2,
			"never"
		],
		"eqeqeq": [
			2,
			"always"
		],
		"func-style": [
			2,
			"declaration",
			{
				"allowArrowFunctions": true
			}
		],
		"multiline-ternary": [
			2,
			"never"
		],
		"no-var": 2,
		"object-property-newline": 2,
		"quote-props": [
			2,
			"consistent"
		],
		"quotes": [
			2,
			"double",
			{"allowTemplateLiterals": true}
		],
		"semi": [
			2,
			"always"
		],
		"@typescript-eslint/consistent-type-definitions": [
			2,
			"interface"
		],
		// All functions need return type
		"@typescript-eslint/explicit-function-return-type": 2,
		// Allow object['property'] access
		"@typescript-eslint/no-unsafe-member-access": 0,
		// Allow object['property'] assignment
		"@typescript-eslint/no-unsafe-assignment": 0,
		// Allow unsafe returns
		"@typescript-eslint/no-unsafe-return": 0,
		// Allow `${variables} in strings`
		"@typescript-eslint/restrict-template-expressions": 0,
		// Allow access to functions on native objects, arrays, etc
		"@typescript-eslint/no-unsafe-call": 0,
		// Allow floating promises (for now)
		"@typescript-eslint/no-floating-promises": 0,
		// Enforce assertion style
		"@typescript-eslint/consistent-type-assertions": [
			2,
			{
				assertionStyle: "angle-bracket",
				objectLiteralTypeAssertions: "allow"
			}
		],
		// Enforce type definition on variables
		"@typescript-eslint/typedef": [
			2,
			{
				"arrowParameter": false,
				"variableDeclaration": true,
				"variableDeclarationIgnoreFunction": true
			}
		],

		// we should always disable console logs and debugging in production
		"no-console": process.env.NODE_ENV === "production" ? 2 : 0,
		"no-debugger": process.env.NODE_ENV === "production" ? 2 : 0
	}
};

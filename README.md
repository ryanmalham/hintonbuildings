# hintonbuildings

## ZIP Code validation script

This repository now includes `zip-validator.js`, a reusable JavaScript validator for U.S. ZIP Codes.

### What it does
- Accepts your **full list of valid U.S. 5-digit ZIP codes**.
- Validates user input on submit.
- Returns:
  - **error** for blank or badly formatted ZIP input,
  - **warning** for correctly formatted but unrecognized ZIP codes,
  - **ok** for recognized ZIP codes.

### Example usage in a form

```html
<form id="zipForm">
  <input id="zipInput" type="text" placeholder="ZIP Code" />
  <button type="submit">Submit</button>
</form>
<p id="zipMessage"></p>

<script src="zip-validator.js"></script>
<script>
  // Replace with your complete U.S. ZIP code list:
  const allZipCodes = ["00501", "10001", "30301", "90210"];

  const validator = createZipValidator(allZipCodes, { allowZipPlus4: true });
  validator.bindToForm({
    form: document.getElementById("zipForm"),
    input: document.getElementById("zipInput"),
    messageEl: document.getElementById("zipMessage"),
  });
</script>
```

### Node/CommonJS usage

```js
const { createZipValidator } = require("./zip-validator");

const allZipCodes = ["00501", "10001", "30301", "90210"];
const validator = createZipValidator(allZipCodes);

console.log(validator.validate("90210"));      // ok
console.log(validator.validate("90210-1234")); // ok (if allowZipPlus4 is true)
console.log(validator.validate("99999"));      // warning
console.log(validator.validate("abcde"));      // error
```

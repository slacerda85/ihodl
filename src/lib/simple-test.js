// Simple test to check for "number is not integral" error
console.log('🧪 Testing for "number is not integral" error...\n')

// Test BigInt conversion with different number types
const testValues = [
  100000, // integer
  100000.0, // float with .0
  100000.5, // float with decimal
  '100000', // string
  null, // null
  undefined, // undefined
]

console.log('Testing BigInt conversion:')
testValues.forEach((value, index) => {
  try {
    const result = BigInt(value)
    console.log(`✅ Test ${index + 1}: ${value} -> ${result}`)
  } catch (error) {
    console.log(`❌ Test ${index + 1}: ${value} -> Error: ${error.message}`)
  }
})

console.log('\nTesting Number.isInteger:')
testValues.forEach((value, index) => {
  const isInteger = Number.isInteger(value)
  console.log(`Test ${index + 1}: ${value} -> isInteger: ${isInteger}`)
})

console.log('\n🎉 Basic number validation tests completed!')

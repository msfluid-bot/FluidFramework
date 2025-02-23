# TestInterface

[Packages](./) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestInterface](./simple-suite-test/testinterface-interface)

Test interface

## Signature {#testinterface-signature}

```typescript
export interface TestInterface
```

## Remarks {#testinterface-remarks}

Here are some remarks about the interface

## Construct Signatures

| ConstructSignature | Return Type | Description |
| --- | --- | --- |
| [new (): TestInterface](./simple-suite-test/testinterface-interface#_new_-constructsignature) | [TestInterface](./simple-suite-test/testinterface-interface) | Test construct signature. |

## Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](./simple-suite-test/testinterface-interface#testclasseventproperty-propertysignature) | `readonly` | () =&gt; void | Test interface event property |

## Properties

| Property | Modifiers | Default Value | Type | Description |
| --- | --- | --- | --- | --- |
| [testInterfaceProperty](./simple-suite-test/testinterface-interface#testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
| [testOptionalInterfaceProperty](./simple-suite-test/testinterface-interface#testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

## Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testInterfaceMethod()](./simple-suite-test/testinterface-interface#testinterfacemethod-methodsignature) | void | Test interface method |

## Call Signatures

| CallSignature | Description |
| --- | --- |
| [(event: 'testCallSignature', listener: (input: unknown) =&gt; void): any](./simple-suite-test/testinterface-interface#_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number](./simple-suite-test/testinterface-interface#_call__1-callsignature) | Another example call signature |

## Construct Signature Details

### new (): TestInterface {#_new_-constructsignature}

Test construct signature.

#### Signature {#_new_-signature}

```typescript
new (): TestInterface;
```

#### Returns {#_new_-returns}

**Return type:** [TestInterface](./simple-suite-test/testinterface-interface)

## Event Details

### testClassEventProperty {#testclasseventproperty-propertysignature}

Test interface event property

#### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

#### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

## Property Details

### testInterfaceProperty {#testinterfaceproperty-propertysignature}

Test interface property

#### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
```

#### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

### testOptionalInterfaceProperty {#testoptionalinterfaceproperty-propertysignature}

Test optional property

#### Signature {#testoptionalinterfaceproperty-signature}

```typescript
testOptionalInterfaceProperty?: number;
```

## Method Details

### testInterfaceMethod {#testinterfacemethod-methodsignature}

Test interface method

#### Signature {#testinterfacemethod-signature}

```typescript
testInterfaceMethod(): void;
```

#### Remarks {#testinterfacemethod-remarks}

Here are some remarks about the method

## Call Signature Details

### (event: 'testCallSignature', listener: (input: unknown) =&gt; void): any {#_call_-callsignature}

Test interface event call signature

#### Signature {#_call_-signature}

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

#### Remarks {#_call_-remarks}

Here are some remarks about the event call signature

### (event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number {#_call__1-callsignature}

Another example call signature

#### Signature {#_call__1-signature}

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

#### Remarks {#_call__1-remarks}

Here are some remarks about the event call signature

## See Also {#testinterface-see-also}

[testInterfaceMethod()](./simple-suite-test/testinterface-interface#testinterfacemethod-methodsignature)

[testInterfaceProperty](./simple-suite-test/testinterface-interface#testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](./simple-suite-test/testinterface-interface#testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](./simple-suite-test/testinterface-interface#testclasseventproperty-propertysignature)

/* eslint-env mocha */
import Scope from '../src/scope'
import { expect } from 'chai'
import sinon from 'sinon'
import _ from 'lodash'

describe('Scope', function () {
  let scope

  beforeEach(function () {
    scope = new Scope()
  })

  it('can be constructed and used as an object', function () {
    scope.someProperty = 1
    expect(scope.someProperty).to.equal(1)
  })

  describe('#$watch', function () {
    it('calls the listener function of a watch on first $digest', function () {
      const watchFn = () => 'wat'
      const listenerFn = sinon.spy()
      scope.$watch(watchFn, listenerFn)

      scope.$digest()

      expect(listenerFn).to.have.been.called
    })

    it('calls the watch function with the scope as first argument', function () {
      const watchFn = sinon.spy()
      const listenerFn = () => {}
      scope.$watch(watchFn, listenerFn)

      scope.$digest()

      expect(watchFn).to.have.been.calledWith(scope)
    })

    it('calls the listener function when the watched value changes', function () {
      scope.someValue = 'a'
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      expect(listenerFn).to.have.not.been.called

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce

      scope.someValue = 'aji'
      expect(listenerFn).to.have.been.calledOnce

      scope.$digest()
      expect(listenerFn).to.have.been.calledTwice
    })

    it('calls listener when watch value is first undefined', function () {
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('calls listener with new value as old value the first time', function () {
      scope.someValue = 233
      let oldValueGiven

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => { oldValueGiven = oldValue }
      )

      scope.$digest()
      expect(oldValueGiven).to.equal(233)
    })

    it('may have watcher that omit listener', function () {
      const watchFn = sinon.stub().returns('hello')
      scope.$watch(watchFn)

      scope.$digest()
      expect(watchFn).to.have.been.called
    })

    it('triggers chained watchers in the same digest', function () {
      scope.name = 'Keal'

      scope.$watch(
        scope => scope.nameUpper,
        (newValue, oldValue, scope) => {
          if (newValue) {
            scope.initial = newValue[0] + '@@'
          }
        }
      )

      scope.$watch(
        scope => scope.name,
        (newValue, oldValue, scope) => {
          if (newValue) {
            scope.nameUpper = newValue.toUpperCase()
          }
        }
      )

      scope.$digest()
      expect(scope.initial).to.equal('K@@')

      scope.name = 'Aji'
      scope.$digest()
      expect(scope.initial).to.equal('A@@')
    })

    it('ends the digest when the last watch is clean', function () {
      scope.arr = _.range(100)
      let executedNum = 0

      _.times(100, function (i) {
        scope.$watch(
          scope => {
            executedNum++
            return scope.arr[i]
          }
        )
      })

      scope.$digest()
      expect(executedNum).to.equal(200)

      scope.arr[0] = 233
      scope.$digest()
      expect(executedNum).to.equal(301)
    })

    it('does not end digest so that new watches are not run', function () {
      scope.someValue = 'hello'
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => {
          scope.$watch(
            scope => scope.someValue,
            listenerFn
          )
        }
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('compare based on value if enabled', function () {
      scope.arr = _.range(3)
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.arr,
        listenerFn,
        true
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce

      scope.arr.push(3)
      scope.$digest()
      expect(listenerFn).to.have.been.calledTwice
    })

    it('handles NaN correctly', function () {
      scope.number = 0 / 0
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.number,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('returns a function to destroy watch', function () {
      scope.someValue = 233
      const listenerFn = sinon.spy()

      const destroyWatch = scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce

      scope.someValue = 256
      scope.$digest()
      expect(listenerFn).to.have.been.calledTwice

      scope.someValue = 512
      destroyWatch()
      scope.$digest()
      expect(listenerFn).to.have.been.calledTwice
    })

    it('allows destroying a $watch during digest', function () {
      scope.someValue = 233
      const watchSpy = []

      scope.$watch(
        scope => {
          watchSpy.push(0)
          return scope.someValue
        }
      )

      const destroyWatch = scope.$watch(
        () => {
          watchSpy.push(1)
          destroyWatch()
        }
      )

      scope.$watch(
        scope => {
          watchSpy.push(2)
          return scope.someValue
        }
      )

      scope.$digest()
      expect(watchSpy).to.deep.equal([0, 1, 2, 0, 2])
    })

    it('allows a $watch to destroy another during digest', function () {
      scope.someValue = 233
      const listenerFn = sinon.spy()
      let destroyWatch

      scope.$watch(
        scope => scope.someValue,
        () => { destroyWatch() }
      )

      destroyWatch = scope.$watch(
        () => {},
        () => {}
      )

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('allows destroying multiple $watches during digest', function () {
      scope.someValue = 233
      const listenerFn = sinon.spy()
      let destroyWatch1, destroyWatch2

      destroyWatch1 = scope.$watch(
        () => {
          destroyWatch1()
          destroyWatch2()
        }
      )

      destroyWatch2 = scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.not.been.called
    })
  })

  describe('#$eval', function () {
    it('executes $eval function and returns result', function () {
      scope.someValue = 233

      const result = scope.$eval(scope => scope.someValue)

      expect(result).to.equal(233)
    })

    it('passes the second function argument', function () {
      scope.someValue = 233

      const result = scope.$eval((scope, arg) => scope.someValue + arg, 2)

      expect(result).to.equal(235)
    })
  })

  describe('#$apply', function () {
    it('executes $apply function and starts digest', function () {
      scope.someValue = 233
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce

      scope.$apply(scope => { scope.someValue = 235 })
      expect(listenerFn).to.have.been.calledTwice
    })
  })

  describe('#$evalAsync', function () {
    it('executes $evalAsync function later in the same cycle', function () {
      scope.someValue = 233
      scope.asyncEvaluated = false
      scope.asyncEvaluatedImmediately = false

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => {
          scope.$evalAsync(scope => { scope.asyncEvaluated = true })
          scope.asyncEvaluatedImmediately = scope.asyncEvaluated
        }
      )

      scope.$digest()
      expect(scope.asyncEvaluated).to.be.true
      expect(scope.asyncEvaluatedImmediately).to.be.false
    })

    it('executes $evalAsync function added by watch function', function () {
      scope.someValue = 233
      scope.asyncEvaluated = false

      scope.$watch(
        scope => {
          if (!scope.asyncEvaluated) {
            scope.$evalAsync(scope => { scope.asyncEvaluated = true })
          }
          return scope.someValue
        }
      )

      scope.$digest()
      expect(scope.asyncEvaluated).to.be.true
    })

    it('executes $evalAsync function even when not dirty', function () {
      scope.someValue = 233
      scope.asyncEvaluatedTime = 0

      scope.$watch(
        scope => {
          if (scope.asyncEvaluatedTime < 2) {
            scope.$evalAsync(scope => { scope.asyncEvaluatedTime++ })
          }
          return scope.someValue
        }
      )

      scope.$digest()
      expect(scope.asyncEvaluatedTime).to.equal(2)
    })

    it('throws error when halted by $evalAsyncs added by watch', function () {
      scope.$watch(
        scope => {
          scope.$evalAsync(() => {})
          return scope.someValue
        }
      )

      expect(() => { scope.$digest() }).to.throw()
    })

    it('schedules a digest in $evalAsync', function (done) {
      scope.someValue = 233
      const listernerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        listernerFn
      )

      scope.$evalAsync(() => {})
      expect(listernerFn).to.have.not.been.called
      setTimeout(function () {
        expect(listernerFn).to.have.been.calledOnce
        done()
      }, 10)
    })
  })

  describe('#$applyAsync', function () {
    it('apply function asynchronously', function (done) {
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce

      scope.$applyAsync(scope => { scope.someValue = 233 })
      expect(listenerFn).to.have.been.calledOnce

      setTimeout(() => {
        expect(listenerFn).to.have.been.calledTwice
        done()
      }, 10)
    })

    it('does not execute $applyAsync\'ed function in the same cycle', function (done) {
      scope.someValue = 233
      const asyncAppliedFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => {
          scope.$applyAsync(asyncAppliedFn)
        }
      )

      scope.$digest()
      expect(asyncAppliedFn).to.have.not.been.called
      setTimeout(() => {
        expect(asyncAppliedFn).to.have.been.calledOnce
        done()
      }, 10)
    })

    it('coalesces many calls to $applyAsync', function (done) {
      const watcherFn = sinon.spy(scope => scope.someValue)

      scope.$watch(
        watcherFn
      )

      scope.$applyAsync(scope => { scope.someValue = 233 })
      scope.$applyAsync(scope => { scope.someValue = 256 })

      setTimeout(() => {
        expect(watcherFn).to.have.been.calledTwice
        done()
      }, 10)
    })

    it('cancels and flushes $applyAsync if digest', function (done) {
      const watcherFn = sinon.spy(scope => scope.someValue)

      scope.$watch(
        watcherFn
      )

      scope.$applyAsync(scope => { scope.someValue = 233 })
      scope.$applyAsync(scope => { scope.someValue = 256 })

      scope.$digest()
      expect(watcherFn).to.have.been.calledTwice
      expect(scope.someValue).to.equal(256)

      setTimeout(() => {
        expect(watcherFn).to.have.been.calledTwice
        done()
      }, 50)
    })
  })

  describe('#$phase', function () {
    it('has a $$phase as the current digest phase', function () {
      scope.someValue = 233
      let phaseInWatch, phaseInListener, phaseInApply

      scope.$watch(
        scope => {
          phaseInWatch = scope.$$phase
          return scope.someValue
        },
        (newValue, oldValue, scope) => {
          phaseInListener = scope.$$phase
        }
      )

      scope.$apply(scope => {
        phaseInApply = scope.$$phase
      })

      expect(phaseInWatch).to.equal('$digest')
      expect(phaseInListener).to.equal('$digest')
      expect(phaseInApply).to.equal('$apply')
    })
  })

  describe('#$$postDigest', function () {
    it('runs a $$postDigest function after each digest', function () {
      const postDigestFn = sinon.spy()

      scope.$$postDigest(postDigestFn)

      expect(postDigestFn).to.have.not.been.called

      scope.$digest()
      expect(postDigestFn).to.have.been.calledOnce

      scope.$digest()
      expect(postDigestFn).to.have.been.calledOnce
    })

    it('does not include $$postDigest in a digest', function () {
      scope.someValue = 233

      scope.$$postDigest(() => { scope.someValue = 256 })

      scope.$watch(
        scope => scope.someValue,
        (newValue, oldValue, scope) => { scope.watchedValue = newValue }
      )

      scope.$digest()
      expect(scope.watchedValue).to.equal(233)

      scope.$digest()
      expect(scope.watchedValue).to.equal(256)
    })
  })

  describe('#$watchGroup', function () {
    it('takes watches as an array and calls listener with arrays', function () {
      scope.someValue = 0
      scope.anotherValue = 1

      scope.$watchGroup([
        scope => scope.someValue,
        scope => scope.anotherValue
      ], (newValues, oldValues, scope) => {
        scope.gotNewValues = newValues
        scope.gotOldValues = oldValues
      })

      scope.$digest()
      expect(scope.gotOldValues).to.deep.equal([0, 1])
      expect(scope.gotOldValues).to.deep.equal([0, 1])
    })

    it('only calls listener once per digest', function () {
      const listenerFn = sinon.spy()
      scope.someValue = 0
      scope.anotherValue = 1

      scope.$watchGroup([
        scope => scope.someValue,
        scope => scope.anotherValue
      ], listenerFn)

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('uses the same array of old and new values when first run', function () {
      scope.someValue = 0
      scope.anotherValue = 1

      scope.$watchGroup([
        scope => scope.someValue,
        scope => scope.anotherValue
      ], (newValues, oldValues, scope) => {
        scope.gotOldValues = oldValues
        scope.gotNewValues = newValues
      })

      scope.$digest()
      expect(scope.gotOldValues).to.equal(scope.gotNewValues)
    })

    it('uses different arrays of old and new values for subsequent runs', function () {
      scope.someValue = 0
      scope.anotherValue = 1

      scope.$watchGroup([
        scope => scope.someValue,
        scope => scope.anotherValue
      ], (newValues, oldValues, scope) => {
        scope.gotOldValues = oldValues
        scope.gotNewValues = newValues
      })

      scope.$digest()
      expect(scope.gotOldValues).to.deep.equal([0, 1])

      scope.anotherValue = 2
      scope.$digest()
      expect(scope.gotOldValues).to.deep.equal([0, 1])
      expect(scope.gotNewValues).to.deep.equal([0, 2])
    })

    it('calls the listener once when the watch array is empty', function () {
      scope.someValue = 0
      scope.anotherValue = 1

      scope.$watchGroup([], (newValues, oldValues, scope) => {
        scope.gotOldValues = oldValues
        scope.gotNewValues = newValues
      })

      scope.$digest()
      expect(scope.gotOldValues).to.be.an('array').and.empty
      expect(scope.gotNewValues).to.be.an('array').and.empty
    })

    it('can be deregistered', function () {
      scope.someValue = 0
      scope.anotherValue = 1
      const listenerFn = sinon.spy()

      const destroyGroup = scope.$watchGroup([
        scope => scope.someValue,
        scope => scope.anotherValue
      ], listenerFn)

      scope.$digest()
      scope.anotherValue = 2
      destroyGroup()
      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('does not call the zero-watch listener when deregistered first', function () {
      const listenerFn = sinon.spy()

      const destroyGroup = scope.$watchGroup([], listenerFn)

      destroyGroup()
      scope.$digest()

      expect(listenerFn).to.have.not.been.called
    })
  })

  describe('errorHandling', function () {
    it('catches exceptions in watch functions', function () {
      scope.someValue = 233
      const listenerFn = sinon.spy()

      scope.$watch(
        () => { throw new Error('error') }
      )

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('catches exceptions in listener functions', function () {
      scope.someValue = 233
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        () => { throw new Error('error') }
      )

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$digest()
      expect(listenerFn).to.have.been.calledOnce
    })

    it('catches exceptions in $evalAsync', function (done) {
      scope.someValue = 233
      const listenerFn = sinon.spy()

      scope.$watch(
        scope => scope.someValue,
        listenerFn
      )

      scope.$evalAsync(() => {
        throw new Error('error')
      })

      setTimeout(() => {
        expect(listenerFn).to.have.been.calledOnce
        done()
      }, 10)
    })

    it('catches exceptions in $applyAsync', function (done) {
      const appliedFn = sinon.spy()

      scope.$applyAsync(() => {
        throw new Error('error')
      })

      scope.$applyAsync(() => {
        throw new Error('error')
      })

      scope.$applyAsync(appliedFn)

      setTimeout(() => {
        expect(appliedFn).to.have.been.calledOnce
        done()
      }, 10)
    })

    it('catches exceptions in $$postDigest', function () {
      const postDigestFn = sinon.spy()

      scope.$$postDigest(() => {
        throw new Error('error')
      })

      scope.$$postDigest(postDigestFn)

      scope.$digest()
      expect(postDigestFn).to.have.been.calledOnce
    })
  })
})

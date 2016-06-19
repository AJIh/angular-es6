/* @flow */
import _ from 'lodash';

type FilterFunction = (item: any, ...value: any) => any;
type FiltersMap = { [key: string]: FilterFunction };
type FactoryFunction = (u: any) => FilterFunction;
type FactoryMap = { [key: string]: FactoryFunction };

let filters: FiltersMap = {};

function register(name: string | FactoryMap, factory?: FactoryFunction): (FilterFunction | FilterFunction[]) {
  if (name != null && typeof name === 'object') {
    return _.map((name: any), (value: FactoryFunction, key: string) => register(key, value));
  } else if (factory) {
    const filter = factory();
    filters[name] = filter;
    return filter;
  }
  throw new Error('Not correctly registering');
}

function filter(name: string): FilterFunction {
  return filters[name];
}

export { register, filter };

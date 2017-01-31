import Ember from 'ember';
import AddDataQciInitializer from '../../../initializers/add-data-qci';
import { module, test } from 'qunit';

let application;

module('Unit | Initializer | add data qci', {
  beforeEach() {
    Ember.run(function() {
      application = Ember.Application.create();
      application.deferReadiness();
    });
  }
});

// Replace this with your real tests.
test('it works', function(assert) {
  AddDataQciInitializer.initialize(application);

  // you would normally confirm the results of the initializer here
  assert.ok(true);
});

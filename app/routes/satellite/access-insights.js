import Ember from 'ember';

export default Ember.Route.extend({

  model() {
    return this.modelFor('deployment');
  },

  deactivate() {
    return this.send('saveDeployment', null);
  }

});

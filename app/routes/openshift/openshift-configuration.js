import Ember from 'ember';
import ResetsVerticalScroll from '../../mixins/resets-vertical-scroll';

export default Ember.Route.extend(ResetsVerticalScroll, {

  setupController(controller, model) {
    controller.set('model', model);

    controller.set('errorMsg', null);
    controller.set('showLoadingSpinner', false);

    controller.set('confirmUserPassword', model.get('openshift_user_password'));

    if (Ember.isEmpty(model.get('openshift_storage_type'))) {
      model.set('openshift_storage_type', 'NFS');
    }
    if (Ember.isEmpty(model.get('openshift_username'))) {
      model.set('openshift_username', 'cloudsuite-install');
    }
    this.store.findAll('hostgroup').then(function(results) {
      var fusorBaseHostgroup = results.filterBy('name', 'Fusor Base').get('firstObject');
      controller.set('domainName', fusorBaseHostgroup.get('domain.name'));
    });
  },

  deactivate() {
    return this.send('saveDeployment', null);
  }

});

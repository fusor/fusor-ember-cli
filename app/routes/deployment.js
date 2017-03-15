import Ember from 'ember';
import DeploymentRouteMixin from '../mixins/deployment-route-mixin';
import request from 'ic-ajax';

export default Ember.Route.extend(DeploymentRouteMixin, {

  model(params) {
    return this.store.findRecord('deployment', params.deployment_id);
  },

  setupController(controller, model) {
    controller.set('model', model);
    controller.set('satelliteTabRouteName', 'satellite.index');
    controller.set('lifecycleEnvironmentTabRouteName', 'configure-environment');
    controller.set('model.host_naming_scheme', 'Freeform');
    controller.set('confirmRhevRootPassword', model.get('rhev_root_password'));
    controller.set('confirmRhevEngineAdminPassword', model.get('rhev_engine_admin_password'));
    controller.set('confirmCfmeRootPassword', model.get('cfme_root_password'));
    controller.set('confirmCfmeAdminPassword', model.get('cfme_admin_password'));
    controller.set('confirmCfmeDbPassword', model.get('cfme_db_password'));
    model.get('openstack_deployment').then(function(result) {
      if (Ember.isPresent(result)) {
        controller.set('confirmOvercloudPassword', result.get('overcloud_password'));
      }
    });

    this.loadDefaultDomainName(controller);
    this.loadUpstreamConsumer(controller, model);

    this.loadDefaultData(model);
  },

  loadDefaultDomainName(controller) {
    this.store.findAll('hostgroup').then(function(hostgroups) {
      return hostgroups.filterBy('name', 'Fusor Base').get('firstObject')
      .get('domain.name');
    }).then(domainName => controller.set('defaultDomainName', domainName));
  },

  loadUpstreamConsumer(controller, model) {
    // check if org has upstream UUID
    this.store.findRecord('organization', model.get('organization.id')).then(org => {
      const shouldSetUpstreamConsumer =
        Ember.isPresent(org.get('upstream_consumer_uuid')) &&
        Ember.isBlank(controller.get('model.upstream_consumer_uuid'));

      if (shouldSetUpstreamConsumer) {
        controller.set('model.upstream_consumer_uuid', org.get('upstream_consumer_uuid'));
        controller.set('model.upstream_consumer_name', org.get('upstream_consumer_name'));
      }
    });
  },

  loadDefaultData(model, opt) {
    Ember.RSVP.all([
      request(window.fusorServer + '/fusor/api/v21/settings/openshift').then(settings => {
        model.loadOpenshiftDefaults(settings['settings'], opt);
      }),
      request(window.fusorServer + '/fusor/api/v21/settings/cloudforms').then(settings => {
        model.loadCloudformsDefaults(settings['settings'], opt);
      })
    ]);
  },

  actions: {
    installDeployment() {
      var self = this;
      var deployment = self.modelFor('deployment');
      var token = Ember.$('meta[name="csrf-token"]').attr('content');

      var controller = this.controllerFor('review/installation');

      if(controller.get('modalOpen')) {
        controller.closeContinueDeployModal();
      }

      controller.set('spinnerTextMessage', 'Building task list');
      controller.set('showSpinner', true);

      request({
        url: `${window.fusorServer}/fusor/api/v21/deployments/${deployment.get('id')}/deploy`,
        type: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
          "Authorization": "Basic " + self.get('session.basicAuthToken')
        }
      }).then(
        function () {
          deployment.reload().then(() => {
            controller.set('showSpinner', false);
            self.transitionTo('review.progress.overview');
          }).catch(err => {
            console.log(err);
            controller.set('showSpinner', false);
            controller.set('errorMsg', 'Error reloading deployment task');
            controller.set('showErrorMessage', true);
          });
        },
        function (response) {
          controller.set('showSpinner', false);

          if (response.jqXHR.status === 422 && response.jqXHR.responseJSON && response.jqXHR.responseJSON.errors) {
            // rails is sending back validation errors as a 422 with an errors hash that looks like
            // errors: {field => [error_messages]}
            let validationErrors = [];
            let errors = response.jqXHR.responseJSON.errors;
            let addValidationError = (error) => validationErrors.push(error);

            for (var prop in errors) {
              if (errors.hasOwnProperty(prop)) {
                errors[prop].forEach(addValidationError);
              }
            }
            controller.set('validationErrors', validationErrors);
          } else {
            controller.set('errorMsg', response.jqXHR.responseText);
            controller.set('showErrorMessage', true);
          }
        });
    },

    attachSubscriptions() {
      var self = this;
      var token = Ember.$('meta[name="csrf-token"]').attr('content');
      var sessionPortal = this.modelFor('subscriptions').sessionPortal;
      var consumerUUID = sessionPortal.get('consumerUUID');
      var subscriptionPools = this.controllerFor('subscriptions/select-subscriptions').get('subscriptionPools');

      var controller = this.controllerFor('review/installation');

      controller.set('buttonDeployDisabled', true);
      controller.set('spinnerTextMessage', 'Attaching Subscriptions in Red Hat Customer Portal');
      controller.set('showSpinner', true);

      subscriptionPools.forEach(function(item){
        console.log(item);
        console.log('qtyToAttach is');
        console.log(item.get('qtyToAttach'));
        console.log('pool ID is');
        console.log(item.get('id'));
        console.log('isSelectedSubscription is');
        console.log(item.get('isSelectedSubscription'));

        if (item.get('qtyToAttach') > 0) {
          // POST /customer_portal/consumers/#{CONSUMER['uuid']}/entitlements?pool=#{POOL['id']}&quantity=#{QUANTITY}
          var url = '/customer_portal/consumers/' + consumerUUID + "/entitlements?pool=" + item.get('id') + "&quantity=" + item.get('qtyToAttach');
          console.log('POST attach subscriptions using following URL');
          console.log(url);

          request({
            url: url,
            type: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "X-CSRF-Token": token
            }
          }).then(function(response) {
            console.log('successfully attached ' + item.qtyToAttach + ' subscription for pool ' + item.id);
            self.send('installDeployment');
          }, function(error) {
            console.log('error on attachSubscriptions');
            return self.send('error');
          });
        }
      });
    },

    saveAndCancelDeployment() {
      return this.send('saveDeployment', 'deployments');
    },

    cancelAndDeleteDeployment() {
      var deployment = this.get('controller.model');
      var self = this;
      deployment.destroyRecord().then(function() {
        return self.transitionTo('deployments');
      });
    },

    error(reason) {
      console.log(reason);
      var controller = this.controllerFor('deployment');

      if (typeof reason === 'string') {
        controller.set('errorMsg', reason);
      } else if (reason && typeof reason === 'object') {
        if (reason.responseJSON && reason.responseJSON.error && reason.responseJSON.error.message) {
          controller.set('errorMsg', reason.responseJSON.error.message);
        } else if (reason.responseText) {
          controller.set('errorMsg', reason.responseText);
        }
      }
    },

    refreshModel() {
      console.log('refreshModelOnDeploymentRoute');
      return this.refresh();
    },

    loadDefaultData(model, opt) {
      this.loadDefaultData(model, opt);
    }
  }
});

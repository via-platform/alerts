const {CompositeDisposable, Disposable, Emitter} = require('via');
const ChartAlerts = require('./chart-alerts');
const AlertManager = require('./alert-manager');
const AlertCreator = require('./alert-creator');
const Alert = require('./alert');
const AlertsStatusView = require('./alerts-status-view');
const _ = require('underscore-plus');
const uri = 'wss://data.via.world/stream';
const base = 'via://alerts';

const InterfaceConfiguration = {
    manager: {
        name: 'Manage Alerts',
        description: 'View and manage alerts.',
        command: 'alerts:open-manager',
        uri: base + '/manage'
    },
    creator: {
        name: 'Create Alert',
        description: 'Create and transmit new alerts for the specified symbol.',
        command: 'alerts:open-creator',
        uri: base + '/create'
    }
};

class AlertsPackage {
    async initialize(){
        this.alerts = [];
        this.charts = [];
        this.managers = [];
        this.creators = [];
        this.emitter = new Emitter();
        this.disposables = new CompositeDisposable();
        this.update = this.update.bind(this);

        this.disposables.add(via.commands.add('via-workspace', {
            'alerts:open-manager': () => via.workspace.open(`${base}/manage`),
            'alerts:open-creator': () => via.workspace.open(`${base}/create`)
        }));

        this.disposables.add(via.workspace.addOpener(uri => {
            if(uri === `${base}/manage` || uri.startsWith(`${base}/manage/`)){
                const manager = new AlertManager({manager: this, omnibar: this.omnibar}, {uri});
                this.managers.push(manager);
                return manager;
            }
        }, InterfaceConfiguration.manager));

        this.disposables.add(via.workspace.addOpener(uri => {
            if(uri === `${base}/create` || uri.startsWith(`${base}/create/`)){
                const creator = new AlertCreator({manager: this, omnibar: this.omnibar}, {uri});
                this.creators.push(creator);
                return creator;
            }
        }, InterfaceConfiguration.creator));

        await via.markets.initialize();

        this.disposables.add(via.data.stream.subscribe({type: 'alerts'}, this.message.bind(this)));
    }

    deserializeAlertManager(state){
        const manager = AlertManager.deserialize({manager: this, omnibar: this.omnibar}, state);
        this.managers.push(manager);
        return manager;
    }

    deserializeAlertCreator(state){
        const creator = AlertCreator.deserialize({manager: this, omnibar: this.omnibar}, state);
        this.creators.push(creator);
        return creator;
    }

    all(){
        return this.alerts.slice();
    }

    open(){
        return this.alerts.filter(alert => alert.isOpen());
    }

    valid(){
        return this.alerts.filter(alert => alert.isValidAlert());
    }

    create(params){
        if(params.created) params.created = new Date(params.created);
        if(params.updated) params.updated = new Date(params.updated);
        if(params.expiration) params.expiration = new Date(params.expiration);

        const alert = new Alert(this, params);
        this.alerts.push(alert);
        this.emitter.emit('did-create-alert', alert);
        return alert;
    }

    find(uuid){
        // debugger;
        return this.alerts.find(alert => alert.uuid === uuid);
    }

    update(params, notify = true){
        const market = via.markets.get(params.market);

        if(params.created) params.created = new Date(params.created);
        if(params.updated) params.updated = new Date(params.updated);
        if(params.expiration) params.expiration = new Date(params.expiration);

        if(market){
            const existing = this.find(params.uuid);

            if(existing){
                existing.update(_.extend(params, {market}));
            }else{
                this.create(_.extend(params, {market}));
            }

            if(notify) via.console.log(`Updated alert on ${market.title}`);
        }else{
            //No clue what happened if it hits this line...
            via.console.warn(`Received message to update unknown alert.`, message);
            console.warn('Alert not found:', message);
        }
    }

    message(message){
        if(message.action === 'snapshot'){
            for(const alert of this.open()) alert.destroy();
            for(const alert of message.alerts) this.update(alert, false);
        }else if(message.action === 'canceled'){
            const alert = this.find(message.uuid);

            if(alert){
                return alert.destroy();
            }else{
                //No clue what happened if it hits this line...
                via.console.warn(`Received message to update unknown alert.`, message);
                console.warn('Alert not found:', message);
            }
        }else if(message.action === 'updated'){
            this.update(message.alert);
        }else if(message.action === 'created'){
            this.update(message.alert);
        }else if(message.action === 'triggered'){
            const alert = this.find(message.event.alert);

            if(alert){
                alert.trigger(message.event);
            }else{
                //No clue what happened if it hits this line...
                via.console.warn(`Received message to update unknown alert.`, message);
                console.warn('Alert not found:', message);
            }
        }
    }

    didUpdateAlert(alert, property, value){
        this.emitter.emit('did-update-alert', {alert, property, value});
    }

    didDestroyAlert(alert){
        _.remove(this.alerts, alert);
        this.emitter.emit('did-destroy-alert', alert);
    }

    onDidCreateAlert(callback){
        return this.emitter.on('did-create-alert', callback);
    }

    onDidUpdateAlert(callback){
        return this.emitter.on('did-update-alert', callback);
    }

    onDidDestroyAlert(callback){
        return this.emitter.on('did-destroy-alert', callback);
    }

    onDidTriggerAlert(callback){
        return this.emitter.on('did-trigger-alert', callback);
    }

    consumeActionBar(actionBar){
        this.omnibar = actionBar.omnibar;
    }

    consumeCharts(charts){
        this.disposables.add(charts.plugin({
            describe: () => {
                return {
                    name: 'chart-alerts',
                    parameters: {},
                    title: 'Chart Alerts',
                    description: 'View and modify alerts on the chart.',
                    priority: 9000
                };
            },
            instance: params => {
                return new ChartAlerts(this, params);
            }
        }));
    }

    deactivate(){
        if(this.ws) via.websockets.destroy(this.ws);

        for(const creator of this.creators.slice()) creator.destroy();
        for(const manager of this.managers.slice()) manager.destroy();
        for(const ca of this.charts.slice()) ca.destroy();
        for(const alert of this.all()) alert.destroy();

        this.disposables.dispose();
    }

    consumeStatusBar(status){
        this.status = status;
        this.attachStatusBarView();
    }

    attachStatusBarView(){
        if(!this.statusViewAttached){
            this.statusViewAttached = new AlertsStatusView({manager: this, status: this.status});
        }
    }

    didDestroyChartAlerts(ca){
        _.remove(this.charts, ca);
    }

    destroy(){
        if(this.statusViewAttached){
            this.statusViewAttached.destroy();
        }

        this.emitter.dispose();
    }
}

module.exports = new AlertsPackage();
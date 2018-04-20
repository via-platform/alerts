const {CompositeDisposable, Disposable, Emitter} = require('via');
const ChartAlerts = require('./chart-alerts');
const AlertManager = require('./alert-manager');
const AlertCreator = require('./alert-creator');
const Alert = require('./alert');
const _ = require('underscore-plus');
const uri = 'wss://alerts.via.world/stream';
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
    activate(){
        this.disposables = new CompositeDisposable();
        this.emitter = new Emitter();
        this.alerts = [];
        this.backlog = [];
        this.charts = [];
        this.managers = [];
        this.creators = [];

        this.ws = via.websockets.create(uri, this.headers.bind(this));
        this.ws.onDidReceiveMessage(this.message.bind(this));

        this.disposables.add(via.markets.onDidCreateMarket(this.process.bind(this)));

        this.disposables.add(via.commands.add('via-workspace', {
            'alerts:open-manager': () => via.workspace.open(`${base}/manage`),
            'alerts:open-creator': () => via.workspace.open(`${base}/create`)
        }));

        this.disposables.add(via.workspace.addOpener(uri => {
            if(uri === `${base}/manage` || uri.startsWith(`${base}/manage/`)){
                const manager = new AlertManager({manager: this, omnibar: this.omnibar, uri});
                this.managers.push(manager);
                return manager;
            }
        }, InterfaceConfiguration.manager));

        this.disposables.add(via.workspace.addOpener(uri => {
            if(uri === `${base}/create` || uri.startsWith(`${base}/create/`)){
                const creator = new AlertCreator({manager: this, omnibar: this.omnibar, uri});
                this.creators.push(creator);
                return creator;
            }
        }, InterfaceConfiguration.creator));
    }

    all(){
        return this.alerts.slice();
    }

    valid(){
        return this.alerts.filter(alert => alert.isValidAlert());
    }

    headers(){
        return {headers: {authorization: 'Bearer ' + via.user.token}};
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
        return this.alerts.find(alert => alert.uuid === uuid);
    }

    update(params){
        const market = via.markets.all().find(market => market.exchange.id === params.exchange && market.id === params.market);

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
        }else{
            const existing = this.backlog.find(alert => alert.uuid === params.uuid);

            if(existing){
                this.backlog.splice(this.backlog.indexOf(existing), 1, params);
            }else{
                this.backlog.push(params);
            }
        }
    }

    message(msg){
        const message = JSON.parse(msg);

        if(message.type === 'snapshot'){
            for(const alert of this.all()) alert.destroy();

            this.alerts = [];

            for(const alert of message.alerts) this.update(alert);
        }else if(message.type === 'canceled'){
            const alert = this.find(message.uuid);
            if(alert) return alert.destroy();

            const backloggedAlert = this.backlog.find(a => a.uuid === message.uuid);
            if(backloggedAlert) _.remove(this.backlog, backloggedAlert);
        }else if(message.type === 'updated'){
            this.update(message.alert);
        }else if(message.type === 'created'){
            this.update(message.alert);
        }else if(message.type === 'triggered'){
            const alert = this.find(message.event.alert);

            if(alert){
                alert.trigger(message.event);
            }else{
                //It's probably backlogged and there's nothing we can do for now
            }
        }
    }

    process(market){
        if(!this.backlog.length) return;

        for(const alert of this.backlog.slice()){
            if(alert.market === market.symbol && alert.exchange === market.exchange.id){
                this.create(_.extend(alert, {market}));
                _.remove(this.backlog, alert);
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
        this.disposables.add(charts.observeCharts(chart => this.charts.push(new ChartAlerts({manager: this, chart}))));
    }

    deactivate(){
        if(this.ws) via.websockets.destroy(this.ws);

        for(const creator of this.creators.slice()) ca.destroy();
        for(const manager of this.managers.slice()) ca.destroy();
        for(const ca of this.charts.slice()) ca.destroy();
        for(const alert of this.all()) alert.destroy();

        this.disposables.dispose();
        this.emitter.dispose();
    }

    didDestroyChartAlerts(ca){
        _.remove(this.charts, ca);
    }
}

module.exports = new AlertsPackage();